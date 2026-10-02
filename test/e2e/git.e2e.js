const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { makeSandbox, launchApp, setEditor } = require('./helpers');

let sandbox;
let app;
let win;
let pageErrors;
let remote;
let gitEnv;

const sh = (cwd, ...args) => execFileSync('git', args, { cwd, env: { ...process.env, ...gitEnv }, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const feedback = () => win.textContent('#git-feedback');
const waitIdle = () => win.waitForSelector('#git-modal:not(.busy)');
const openPanel = async () => {
  if (await win.isVisible('#git-modal')) return;
  await win.keyboard.press('Control+Shift+G');
  await win.waitForSelector('#git-modal:not(.hidden)');
  await waitIdle();
};
const changedPaths = async () => (await win.locator('#git-changes .git-change-path').allTextContents()).sort();

test.before(async () => {
  sandbox = makeSandbox({
    'Note.md': '# Note\n',
    'Work/Acme.md': '# Acme\n'
  });
  const emptyConfig = path.join(sandbox.root, 'empty.gitconfig');
  fs.writeFileSync(emptyConfig, '');
  // No global identity: the panel's "Commit as" must provide it
  gitEnv = { GIT_CONFIG_GLOBAL: emptyConfig, GIT_CONFIG_NOSYSTEM: '1' };
  remote = path.join(sandbox.root, 'remote.git');
  execFileSync('git', ['init', '--bare', '-b', 'main', remote], { stdio: 'ignore' });
  ({ app, win, pageErrors } = await launchApp(sandbox, { env: gitEnv }));
});

test.after(async () => {
  await app?.close();
  sandbox?.cleanup();
});

test('the status bar offers Git setup and the panel initializes the vault', async () => {
  // The status-bar summary loads in the background after the vault opens
  await win.waitForFunction(() => document.querySelector('#git-status-item').textContent !== 'Git');
  assert.match(await win.textContent('#git-status-item'), /Set up Git/);
  await openPanel();
  await win.click('#btn-git-init');
  await win.waitForSelector('#btn-git-sync');
  assert.ok(sandbox.isDir('.git'));
  assert.match(sandbox.read('.gitignore'), /^\.pinnote\/$/m);
  assert.ok(fs.existsSync(path.join(sandbox.vault, '.pinnote', 'guard.txt')), 'guard rules are created');
  assert.deepEqual(await changedPaths(), ['.gitignore', 'Note.md', 'Work/Acme.md']);
});

test('"Commit as" stores the author in the vault repo only', async () => {
  await win.fill('#git-name', 'hahuyhungdev');
  await win.fill('#git-email', 'hahuyhungdev@gmail.com');
  await win.click('#btn-git-identity');
  await waitIdle();
  assert.equal(sh(sandbox.vault, 'config', '--local', 'user.email'), 'hahuyhungdev@gmail.com');
});

test('a folder can be kept local-only, out of Git', async () => {
  await win.selectOption('#git-local-only-add', { label: 'Work' });
  await waitIdle();
  assert.deepEqual(await changedPaths(), ['.gitignore', 'Note.md']);
  assert.match(await win.textContent('#git-local-only'), /Work/);
  // The sidebar marks it too
  assert.equal(await win.locator('#note-tree .folder-item:has(.folder-name:text-is("Work")) .folder-local').count(), 1);
});

test('connect a remote and Sync commits and pushes', async () => {
  await win.fill('#git-remote-url', remote);
  await win.click('#btn-git-remote');
  await waitIdle();
  await win.fill('#git-commit-message', 'First notes');
  await win.click('#btn-git-sync');
  await waitIdle();
  assert.match(await feedback(), /pushed/i);
  assert.equal(sh(remote, 'log', '-1', '--format=%s %ae', 'main'), 'First notes hahuyhungdev@gmail.com');
  assert.doesNotMatch(sh(remote, 'ls-tree', '-r', '--name-only', 'main'), /Acme/, 'local-only folder never left the machine');
  assert.deepEqual(await changedPaths(), []);
  assert.match(await win.textContent('#git-status-item'), /main/);
});

test('the guard stops a commit with sensitive content until confirmed, and again before push', async () => {
  await win.click('#btn-close-git');
  await win.click('#note-tree .note-item:has(.note-title:text-is("Note"))');
  await win.waitForSelector('#active-note-badge:text-is("Note.md")');
  await setEditor(win, '# Note\n\nPricing from Nexon: 42\n');
  await win.dispatchEvent('#markdown-input', 'input');

  // Opening the panel flushes the pending autosave first
  await openPanel();
  const before = sh(sandbox.vault, 'rev-list', '--count', 'HEAD');
  await win.click('#btn-git-commit');
  await waitIdle();
  await win.waitForSelector('#git-guard:not([hidden])');
  assert.match(await win.textContent('#git-guard'), /Note\.md:3/);
  assert.match(await win.textContent('#git-guard'), /nexon/);
  assert.equal(sh(sandbox.vault, 'rev-list', '--count', 'HEAD'), before, 'nothing committed yet');

  await win.click('#btn-git-force');
  await waitIdle();
  assert.equal(Number(sh(sandbox.vault, 'rev-list', '--count', 'HEAD')), Number(before) + 1);

  await win.click('#btn-git-push');
  await waitIdle();
  await win.waitForSelector('#git-guard:not([hidden])');
  assert.notEqual(sh(remote, 'log', '-1', '--format=%s', 'main'), sh(sandbox.vault, 'log', '-1', '--format=%s'));
  await win.click('#btn-git-guard-cancel');
  assert.equal(await win.isVisible('#git-guard'), false);
});

test('Pull brings in notes from another machine and reloads the open note', async () => {
  // Undo the sensitive commit locally so the remote can move on cleanly
  sh(sandbox.vault, 'reset', '--hard', 'origin/main');
  const other = path.join(sandbox.root, 'laptop');
  sh(sandbox.root, 'clone', remote, other);
  sh(other, 'config', 'user.name', 'Laptop');
  sh(other, 'config', 'user.email', 'laptop@example.com');
  fs.writeFileSync(path.join(other, 'From laptop.md'), '# Laptop\n');
  fs.writeFileSync(path.join(other, 'Note.md'), '# Note\n\nedited on the laptop\n');
  sh(other, 'add', '-A');
  sh(other, 'commit', '-m', 'From laptop');
  sh(other, 'push');

  await win.click('#btn-git-pull');
  await waitIdle();
  assert.match(await feedback(), /pulled/i);
  await win.waitForSelector('#note-tree .note-title:text-is("From laptop")');
  await win.waitForFunction(() => document.querySelector('#markdown-input').value.includes('edited on the laptop'));
});

test('guard rules can be edited from the panel', async () => {
  await win.click('#git-guard-rules-toggle');
  const rules = await win.inputValue('#git-guard-rules');
  assert.match(rules, /^nexon$/m);
  await win.fill('#git-guard-rules', `${rules}\nproject-phoenix\n`);
  await win.click('#btn-git-guard-save');
  await waitIdle();
  assert.match(fs.readFileSync(path.join(sandbox.vault, '.pinnote', 'guard.txt'), 'utf-8'), /^project-phoenix$/m);
  await win.keyboard.press('Escape');
  assert.equal(await win.isVisible('#git-modal'), false);
});

test('no renderer errors were thrown', () => {
  assert.deepEqual(pageErrors, []);
});
