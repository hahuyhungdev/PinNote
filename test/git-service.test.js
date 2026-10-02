const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const {
  createGitService,
  parseStatus,
  isValidRemoteUrl,
  defaultCommitMessage
} = require('../src/lib/git-service');

// Deterministic git: no user/system config, fixed identity
const ENV = {
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'PinNote Test',
  GIT_AUTHOR_EMAIL: 'test@pinnote.local',
  GIT_COMMITTER_NAME: 'PinNote Test',
  GIT_COMMITTER_EMAIL: 'test@pinnote.local'
};

let tmp;
let git;
const sh = (cwd, ...args) => execFileSync('git', args, { cwd, env: { ...process.env, ...ENV }, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const write = (dir, name, text) => {
  fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
  fs.writeFileSync(path.join(dir, name), text);
};

before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pinnote-git-'));
  const emptyConfig = path.join(tmp, 'empty.gitconfig');
  fs.writeFileSync(emptyConfig, '');
  ENV.GIT_CONFIG_GLOBAL = emptyConfig;
  git = createGitService({ env: ENV });
});

after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('parseStatus reads branch, tracking and changed paths from porcelain v2 -z output', () => {
  const out = [
    '# branch.oid abc', '# branch.head main', '# branch.upstream origin/main', '# branch.ab +2 -1',
    '1 .M N... 100644 100644 100644 a b Work/Sprint notes.md',
    '1 A. N... 000000 100644 100644 0 b New.md',
    '2 R. N... 100644 100644 100644 a b R100 Renamed.md', 'Old.md',
    '1 .D N... 100644 100644 000000 a b Gone.md',
    '? Untracked note.md',
    ''
  ].join('\0');
  assert.deepEqual(parseStatus(out), {
    branch: 'main',
    upstream: 'origin/main',
    ahead: 2,
    behind: 1,
    changes: [
      { path: 'Work/Sprint notes.md', code: 'M' },
      { path: 'New.md', code: 'A' },
      { path: 'Renamed.md', code: 'R' },
      { path: 'Gone.md', code: 'D' },
      { path: 'Untracked note.md', code: '?' }
    ]
  });
});

test('isValidRemoteUrl accepts real remotes and rejects option injection', () => {
  for (const ok of ['https://github.com/me/notes.git', 'git@github.com:me/notes.git', 'ssh://git@host/x.git',
    'file:///C:/backup/notes.git', 'C:\\backup\\notes.git', '/srv/notes.git']) {
    assert.equal(isValidRemoteUrl(ok), true, ok);
  }
  for (const bad of ['', '--upload-pack=calc.exe', '-u x', 'notes', 'ext::sh -c evil', 'https://x\nhttps://y']) {
    assert.equal(isValidRemoteUrl(bad), false, bad);
  }
});

test('defaultCommitMessage summarises the changed notes', () => {
  assert.equal(defaultCommitMessage([{ path: 'Work/Sprint.md', code: 'M' }]), 'Update Sprint');
  assert.equal(defaultCommitMessage([{ path: 'a.md' }, { path: 'b.md' }, { path: 'c.md' }]), 'Update 3 notes: a, b, c');
  assert.equal(defaultCommitMessage([{ path: 'a.md' }, { path: 'b.md' }, { path: 'c.md' }, { path: 'd.md' }]), 'Update 4 notes: a, b, c, …');
  assert.equal(defaultCommitMessage([]), 'Update notes');
});

test('status reports a plain folder as not a repository', async () => {
  const dir = path.join(tmp, 'plain');
  fs.mkdirSync(dir);
  assert.equal((await git.status(dir)).isRepo, false);
});

test('init creates a repo on main that ignores .pinnote, and commit records notes', async () => {
  const dir = path.join(tmp, 'vault');
  write(dir, 'Note.md', '# Note\n');
  write(dir, '.pinnote/history/x.json', '{}');
  await git.init(dir);

  assert.match(fs.readFileSync(path.join(dir, '.gitignore'), 'utf-8'), /^\.pinnote\/$/m);
  let status = await git.status(dir);
  assert.equal(status.isRepo, true);
  assert.equal(status.branch, 'main');
  assert.deepEqual(status.changes.map(c => c.path).sort(), ['.gitignore', 'Note.md']);

  assert.deepEqual(await git.commit(dir, 'First notes'), { committed: true, message: 'First notes' });
  assert.equal(sh(dir, 'log', '-1', '--format=%s'), 'First notes');
  status = await git.status(dir);
  assert.deepEqual(status.changes, []);
  assert.equal((await git.commit(dir)).committed, false, 'nothing to commit');

  // init on an existing repo keeps it and does not duplicate the ignore rule
  await git.init(dir);
  assert.equal(fs.readFileSync(path.join(dir, '.gitignore'), 'utf-8').match(/\.pinnote\//g).length, 1);
});

test('push, pull and sync round-trip through a remote', async () => {
  const dir = path.join(tmp, 'vault');
  const remote = path.join(tmp, 'remote.git');
  sh(tmp, 'init', '--bare', '-b', 'main', remote);

  await git.setRemote(dir, remote);
  assert.equal((await git.status(dir)).remoteUrl, remote);
  await git.push(dir);
  assert.equal(sh(remote, 'log', '-1', '--format=%s', 'main'), 'First notes');
  assert.equal((await git.status(dir)).upstream, 'origin/main');

  // Another machine adds a note
  const other = path.join(tmp, 'other');
  sh(tmp, 'clone', remote, other);
  write(other, 'From laptop.md', '# Laptop\n');
  sh(other, 'add', '-A');
  sh(other, 'commit', '-m', 'From laptop');
  sh(other, 'push');

  assert.deepEqual(await git.pull(dir), { updated: true });
  assert.ok(fs.existsSync(path.join(dir, 'From laptop.md')));
  assert.deepEqual(await git.pull(dir), { updated: false });

  // Sync = commit local edits, pull, push
  write(dir, 'Note.md', '# Note\nedited\n');
  const result = await git.sync(dir, '');
  assert.equal(result.committed, true);
  assert.equal(result.pushed, true);
  assert.equal(sh(remote, 'log', '-1', '--format=%s', 'main'), 'Update Note');

  // setRemote again replaces the URL instead of failing
  await git.setRemote(dir, remote);
  await assert.rejects(git.setRemote(dir, '--upload-pack=evil'), /valid/);
});

test('a conflicting pull is aborted cleanly and keeps the local commit', async () => {
  const dir = path.join(tmp, 'vault');
  const other = path.join(tmp, 'other');
  sh(other, 'pull');
  write(other, 'Note.md', '# Note\nlaptop version\n');
  sh(other, 'commit', '-am', 'Laptop edit');
  sh(other, 'push');

  write(dir, 'Note.md', '# Note\ndesktop version\n');
  await assert.rejects(git.sync(dir, 'Desktop edit'), /conflict/i);
  assert.equal(fs.existsSync(path.join(dir, '.git', 'rebase-merge')), false, 'not left mid-rebase');
  assert.equal(sh(dir, 'log', '-1', '--format=%s'), 'Desktop edit');
  assert.match(fs.readFileSync(path.join(dir, 'Note.md'), 'utf-8'), /desktop version/);
});

test('git commands fail with a readable message outside a repository', async () => {
  await assert.rejects(git.commit(path.join(tmp, 'plain'), 'x'), /not a git repository/i);
});

test('the commit guard blocks matching added lines and file names until forced', async () => {
  const dir = path.join(tmp, 'guarded');
  write(dir, 'Clean.md', '# Clean\n');
  await git.init(dir);
  await git.commit(dir, 'Start');
  const guard = 'nexon\n/api[_-]?key/i';

  write(dir, 'Meeting.md', '# Meeting\n\nPricing call with Nexon\n');
  const blocked = await git.commit(dir, 'Meeting', { guard });
  assert.equal(blocked.committed, false);
  assert.deepEqual(blocked.blocked.map(f => [f.file, f.line, f.rule]), [['Meeting.md', 3, 'nexon']]);
  assert.equal(sh(dir, 'log', '-1', '--format=%s'), 'Start', 'nothing was committed');

  // The same scan runs inside sync, which stops before pulling or pushing
  const synced = await git.sync(dir, 'Meeting', { guard });
  assert.equal(synced.blocked.length, 1);
  assert.equal(synced.stage, 'commit');

  const forced = await git.commit(dir, 'Meeting', { guard, force: true });
  assert.equal(forced.committed, true);

  write(dir, 'Nexon plan.md', '# Plan\n');
  const byName = await git.commit(dir, '', { guard });
  assert.deepEqual(byName.blocked.map(f => [f.file, f.line]), [['Nexon plan.md', null]]);
  await git.commit(dir, 'Plan', { guard, force: true });
});

test('push re-checks outgoing commits, including ones made outside PinNote', async () => {
  const dir = path.join(tmp, 'guarded');
  const remote = path.join(tmp, 'guarded-remote.git');
  sh(tmp, 'init', '--bare', '-b', 'main', remote);
  await git.setRemote(dir, remote);
  const guard = '/api[_-]?key/i';

  // Nothing pushed yet: the whole history is outgoing and is clean for this rule
  assert.deepEqual(await git.push(dir, { guard }), { pushed: true });

  write(dir, 'Config.md', 'apiKey: 12345\n');
  sh(dir, 'add', '-A');
  sh(dir, 'commit', '-m', 'Committed in a terminal');
  const blocked = await git.push(dir, { guard });
  assert.equal(blocked.pushed, false);
  assert.deepEqual(blocked.blocked.map(f => [f.file, f.line]), [['Config.md', 1]]);
  assert.notEqual(sh(remote, 'log', '-1', '--format=%s', 'main'), 'Committed in a terminal');

  assert.deepEqual(await git.push(dir, { guard, force: true }), { pushed: true });
  assert.equal(sh(remote, 'log', '-1', '--format=%s', 'main'), 'Committed in a terminal');
});

test('setIdentity stores the commit author in the vault repo only', async () => {
  const dir = path.join(tmp, 'guarded');
  assert.deepEqual(await git.setIdentity(dir, ' hahuyhungdev ', 'hahuyhungdev@gmail.com'),
    { name: 'hahuyhungdev', email: 'hahuyhungdev@gmail.com' });
  assert.equal(sh(dir, 'config', '--local', 'user.email'), 'hahuyhungdev@gmail.com');
  await assert.rejects(git.setIdentity(dir, 'x', 'not-an-email'), /valid email/);
  await assert.rejects(git.setIdentity(dir, '', 'a@b.c'), /name/);
});

test('the guard also checks the commit author, so a company email is not published', async () => {
  const dir = path.join(tmp, 'guarded');
  await git.setIdentity(dir, 'Ha Huy Hung', 'huy.hung@nexondv.com');
  write(dir, 'Clean too.md', '# fine\n');
  const blocked = await git.commit(dir, 'x', { guard: 'nexon' });
  assert.deepEqual(blocked.blocked.map(f => [f.file, f.excerpt]), [['Commit author', 'Ha Huy Hung <huy.hung@nexondv.com>']]);
  await git.setIdentity(dir, 'hahuyhungdev', 'hahuyhungdev@gmail.com');
  assert.equal((await git.commit(dir, 'x', { guard: 'nexon' })).committed, true);
});
