/**
 * PinNote - Git for the vault
 * Runs the user's installed `git` with fixed argument lists (never a shell) inside the vault folder.
 * Used by the main process; pure helpers are exported for tests.
 */

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const NETWORK_TIMEOUT = 120000;
const LOCAL_TIMEOUT = 30000;
const IGNORE_RULE = '.pinnote/';

// ==========================================
// Pure helpers
// ==========================================

/**
 * Parse `git status --porcelain=v2 --branch -z` output
 */
function parseStatus(output) {
  const records = String(output).split('\0');
  const result = { branch: null, upstream: null, ahead: 0, behind: 0, changes: [] };
  const codeOf = (xy) => (xy[0] !== '.' ? xy[0] : xy[1]);

  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    if (!rec) continue;
    let m;
    if (rec.startsWith('# branch.head ')) result.branch = rec.slice(14);
    else if (rec.startsWith('# branch.upstream ')) result.upstream = rec.slice(18);
    else if ((m = /^# branch\.ab \+(\d+) -(\d+)$/.exec(rec))) {
      result.ahead = Number(m[1]);
      result.behind = Number(m[2]);
    } else if ((m = /^1 (\S\S)(?: \S+){6} (.*)$/.exec(rec))) {
      result.changes.push({ path: m[2], code: codeOf(m[1]) });
    } else if ((m = /^2 (\S\S)(?: \S+){7} (.*)$/.exec(rec))) {
      result.changes.push({ path: m[2], code: 'R' });
      i++; // the original path follows as its own record
    } else if ((m = /^u \S\S(?: \S+){8} (.*)$/.exec(rec))) {
      result.changes.push({ path: m[1], code: 'U' });
    } else if (rec.startsWith('? ')) {
      result.changes.push({ path: rec.slice(2), code: '?' });
    }
  }
  return result;
}

// Allow-list of remote forms; anything else (options, ext:: transports, bare words) is refused
const REMOTE_PATTERNS = [
  /^https?:\/\/\S+$/i,
  /^ssh:\/\/\S+$/i,
  /^[\w.-]+@[\w.-]+:[^\s-]\S*$/,
  /^file:\/\/\S+$/i,
  /^[a-zA-Z]:[\\/].*$/,
  /^\/.*$/
];

function isValidRemoteUrl(url) {
  const value = String(url ?? '').trim();
  if (!value || /[\r\n\0]/.test(value) || value.startsWith('-')) return false;
  return REMOTE_PATTERNS.some(re => re.test(value));
}

function defaultCommitMessage(changes = []) {
  const titles = changes.map(c => path.basename(c.path).replace(/\.(md|txt)$/i, ''));
  if (titles.length === 0) return 'Update notes';
  if (titles.length === 1) return `Update ${titles[0]}`;
  const shown = titles.slice(0, 3).join(', ');
  return `Update ${titles.length} notes: ${shown}${titles.length > 3 ? ', …' : ''}`;
}

/** Turn git's stderr into something a person can act on */
function friendlyError(err, args) {
  if (err.code === 'ENOENT') return new Error('Git is not installed. Install Git for Windows (git-scm.com) and restart PinNote.');
  const text = String(err.stderr || err.message || '').trim();
  if (/Please tell me who you are|unable to auto-detect email/i.test(text)) {
    return new Error('Git does not know who you are yet. Run once in a terminal:\ngit config --global user.name "Your Name"\ngit config --global user.email "you@example.com"');
  }
  if (/terminal prompts disabled|could not read Username|Authentication failed|Permission denied \(publickey\)/i.test(text)) {
    return new Error('GitHub sign-in failed. Sign in once with Git (e.g. run "git push" in a terminal, or install Git Credential Manager), then try again.');
  }
  if (err.killed) return new Error(`git ${args[0]} timed out`);
  const lines = text.split(/\r?\n/).map(l => l.replace(/^(fatal|error|hint): /, '').trim()).filter(Boolean);
  return new Error(lines.slice(0, 4).join('\n') || `git ${args[0]} failed`);
}

// realpath expands Windows 8.3 short names (HUY~1.HUN) so they match git's long-form paths
const canonical = (p) => {
  try {
    return fs.realpathSync.native(path.resolve(p));
  } catch (e) {
    return path.resolve(p);
  }
};
const samePath = (a, b) => process.platform === 'win32'
  ? canonical(a).toLowerCase() === canonical(b).toLowerCase()
  : canonical(a) === canonical(b);

// ==========================================
// Service
// ==========================================

function createGitService({ gitPath = 'git', env = {} } = {}) {
  const run = (cwd, args, timeout = LOCAL_TIMEOUT) => new Promise((resolve, reject) => {
    execFile(gitPath, args, {
      cwd,
      timeout,
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
      // Never wait on a password prompt in a hidden console; credential managers still work
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...env }
    }, (err, stdout, stderr) => {
      if (err) {
        err.stderr = stderr;
        reject(friendlyError(err, args));
      } else {
        resolve(stdout);
      }
    });
  });

  const tryRun = (cwd, args) => run(cwd, args).then(out => out.trim(), () => null);

  /** True only when `dir` is the top of its own repository (not a folder inside another repo) */
  async function isRepoRoot(dir) {
    const top = await tryRun(dir, ['rev-parse', '--show-toplevel']);
    return Boolean(top) && samePath(top, dir);
  }

  async function requireRepo(dir) {
    if (!(await isRepoRoot(dir))) throw new Error('This vault is not a Git repository yet. Initialize Git first.');
  }

  async function remoteUrl(dir) {
    return tryRun(dir, ['remote', 'get-url', 'origin']);
  }

  let availability = null;
  function available() {
    availability ||= run(process.cwd(), ['--version']).then(() => true, () => false);
    return availability;
  }

  async function status(dir) {
    if (!(await isRepoRoot(dir))) return { isRepo: false };
    const out = await run(dir, ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all']);
    return { isRepo: true, remoteUrl: await remoteUrl(dir), ...parseStatus(out) };
  }

  function ensureIgnored(dir) {
    const file = path.join(dir, '.gitignore');
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '';
    if (/^\/?\.pinnote\/?\s*$/m.test(current)) return;
    const prefix = current && !current.endsWith('\n') ? '\n' : '';
    fs.writeFileSync(file, `${current}${prefix}# PinNote's local revision history\n${IGNORE_RULE}\n`, 'utf-8');
  }

  async function init(dir) {
    if (!(await isRepoRoot(dir))) await run(dir, ['init', '-b', 'main']);
    ensureIgnored(dir);
    return status(dir);
  }

  async function setRemote(dir, url) {
    await requireRepo(dir);
    const value = String(url ?? '').trim();
    if (!isValidRemoteUrl(value)) throw new Error('Please enter a valid repository URL (https://github.com/you/notes.git)');
    const args = (await remoteUrl(dir)) ? ['remote', 'set-url', 'origin', value] : ['remote', 'add', 'origin', value];
    await run(dir, args);
    return status(dir);
  }

  async function commit(dir, message = '') {
    await requireRepo(dir);
    await run(dir, ['add', '-A']);
    const { changes } = parseStatus(await run(dir, ['status', '--porcelain=v2', '-z']));
    if (changes.length === 0) return { committed: false, message: null };
    const text = String(message ?? '').trim() || defaultCommitMessage(changes);
    await run(dir, ['commit', '-m', text]);
    return { committed: true, message: text };
  }

  async function gitDir(dir) {
    const value = await tryRun(dir, ['rev-parse', '--git-dir']);
    return value ? path.resolve(dir, value) : path.join(dir, '.git');
  }

  async function pull(dir) {
    await requireRepo(dir);
    if (!(await remoteUrl(dir))) throw new Error('Connect a remote repository first');
    const { branch, upstream } = parseStatus(await run(dir, ['status', '--porcelain=v2', '--branch', '-z']));

    // A brand-new remote has nothing to pull yet
    if (!upstream) {
      const heads = await run(dir, ['ls-remote', '--heads', 'origin', branch], NETWORK_TIMEOUT);
      if (!heads.trim()) return { updated: false };
    }

    const before = await tryRun(dir, ['rev-parse', 'HEAD']);
    const args = upstream
      ? ['pull', '--rebase', '--autostash']
      : ['pull', '--rebase', '--autostash', 'origin', branch];
    try {
      await run(dir, args, NETWORK_TIMEOUT);
    } catch (err) {
      const meta = await gitDir(dir);
      if (fs.existsSync(path.join(meta, 'rebase-merge')) || fs.existsSync(path.join(meta, 'rebase-apply'))) {
        await tryRun(dir, ['rebase', '--abort']);
        throw new Error('Pull stopped: a note was changed both here and on the remote (conflict). ' +
          'Nothing was lost — your commits are kept. Resolve it with a Git tool, then sync again.');
      }
      throw err;
    }
    return { updated: before !== (await tryRun(dir, ['rev-parse', 'HEAD'])) };
  }

  async function push(dir) {
    await requireRepo(dir);
    if (!(await remoteUrl(dir))) throw new Error('Connect a remote repository first');
    await run(dir, ['push', '-u', 'origin', 'HEAD'], NETWORK_TIMEOUT);
    return { pushed: true };
  }

  /** Commit local edits, then pull (rebase) and push when a remote is connected */
  async function sync(dir, message = '') {
    const { committed } = await commit(dir, message);
    if (!(await remoteUrl(dir))) return { committed, updated: false, pushed: false };
    const { updated } = await pull(dir);
    await push(dir);
    return { committed, updated, pushed: true };
  }

  return { available, status, init, setRemote, commit, pull, push, sync };
}

module.exports = { createGitService, parseStatus, isValidRemoteUrl, defaultCommitMessage };
