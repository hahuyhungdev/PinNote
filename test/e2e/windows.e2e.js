const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const electronPath = require('electron');
const { makeSandbox, launchApp, setEditor, waitFor } = require('./helpers');

let sandbox;
let app;
let win;
let pageErrors;

const openNote = async (title) => {
  await win.click(`#note-tree .note-item:has(.note-title:text-is("${title}"))`);
  await win.waitForSelector(`#active-note-badge:text-is("${title}.md")`);
};

const popOut = async () => {
  const [sticky] = await Promise.all([app.waitForEvent('window'), win.click('#btn-popout-note')]);
  await sticky.waitForSelector('#sticky-status.saved');
  await sticky.waitForFunction(() => document.querySelector('#sticky-input').value.length > 0);
  return sticky;
};

test.before(async () => {
  sandbox = makeSandbox({
    'Alpha.md': '# Alpha\n',
    'Beta.md': '# Beta\n',
    'Gone.md': '# Gone\n'
  });
  ({ app, win, pageErrors } = await launchApp(sandbox));
});

test.after(async () => {
  await app?.close().catch(() => {});
  sandbox?.cleanup();
});

test('typing in a sticky note saves and live-syncs into the main window', async () => {
  await openNote('Alpha');
  const sticky = await popOut();
  await sticky.focus('#sticky-input');
  await sticky.keyboard.press('Control+End');
  await sticky.keyboard.type('from sticky');
  assert.ok(await waitFor(() => sandbox.read('Alpha.md').includes('from sticky')));
  await win.waitForFunction(() => document.querySelector('#markdown-input').value.includes('from sticky'));
  const closed = sticky.waitForEvent('close');
  await sticky.click('#sticky-close');
  await closed;
});

test('deleting a note closes its sticky window without re-creating the file', async () => {
  await openNote('Gone');
  const sticky = await popOut();
  win.once('dialog', d => d.accept());
  const closed = sticky.waitForEvent('close');
  // Row actions are revealed on hover
  await win.hover('#note-tree .note-item.active');
  await win.click('#note-tree .note-item.active [data-action="delete"]');
  await closed;
  await new Promise(r => setTimeout(r, 600));
  assert.equal(sandbox.exists('Gone.md'), false);
});

test('closing the main window right after typing flushes the edit to disk', async () => {
  await openNote('Beta');
  // A sticky keeps the app alive once the main window is gone
  await popOut();
  await setEditor(win, '# Beta\nflushed on close');
  await win.dispatchEvent('#markdown-input', 'input');
  const closed = win.waitForEvent('close');
  await win.click('#win-close');
  await closed;
  assert.ok(await waitFor(() => sandbox.read('Beta.md').includes('flushed on close')), sandbox.read('Beta.md'));
});

test('launching PinNote again re-opens the main window when only stickies are left', async () => {
  const reopened = app.waitForEvent('window', { timeout: 15000 });
  const second = spawn(electronPath, sandbox.args, { stdio: 'ignore' });
  const exited = new Promise(resolve => second.on('exit', resolve));
  win = await reopened;
  await win.waitForSelector('#note-tree .note-item');
  assert.match(await win.title(), /PinNote/);
  await exited;
});

test('no renderer errors were thrown', () => {
  assert.deepEqual(pageErrors, []);
});
