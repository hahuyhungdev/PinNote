const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { makeSandbox, launchApp, setEditor, waitFor } = require('./helpers');

let sandbox;
let app;
let win;
let pageErrors;

const folder = (name) => win.locator(`#note-tree .folder-item:has(.folder-name:text-is("${name}"))`);
// A note at the vault root, or inside the named folder (titles repeat across folders)
const note = (title, inFolder = null) => (inFolder
  ? win.locator(`#note-tree .folder-node:has(> .folder-item .folder-name:text-is("${inFolder}")) > .folder-children > .note-item:has(.note-title:text-is("${title}"))`)
  : win.locator(`#note-tree > .note-item:has(.note-title:text-is("${title}"))`));
const folderAction = async (name, action) => {
  await folder(name).hover();
  await folder(name).locator(`[data-action="${action}"]`).click();
};
// alert() blocks the page, so accept it the moment it opens and report its message
const nextDialog = () => new Promise(resolve => win.once('dialog', async (d) => {
  const message = d.message();
  await d.accept();
  resolve(message);
}));
const typeFolderName = async (name) => {
  await win.waitForSelector('#note-tree .new-folder-input');
  await win.fill('#note-tree .new-folder-input', name);
  await win.press('#note-tree .new-folder-input', 'Enter');
};

test.before(async () => {
  sandbox = makeSandbox({
    'Ideas.md': '# Ideas\n',
    'Work/Sprint.md': '# Sprint\n',
    'Work/Ideas.md': '# Work ideas\n'
  });
  ({ app, win, pageErrors } = await launchApp(sandbox));
});

test.after(async () => {
  await app?.close();
  sandbox?.cleanup();
});

test('the New folder button creates a folder at the vault root', async () => {
  await win.click('#btn-new-folder');
  await typeFolderName('Archive');
  await folder('Archive').waitFor();
  assert.ok(sandbox.isDir('Archive'));
});

test('a folder can be created inside another folder', async () => {
  await folderAction('Work', 'new-folder');
  await typeFolderName('Q3');
  await folder('Q3').waitFor();
  assert.ok(sandbox.isDir('Work/Q3'));
});

test('a duplicate folder name is refused with a message', async () => {
  const dialog = nextDialog();
  await win.click('#btn-new-folder');
  await typeFolderName('archive');
  assert.match(await dialog, /already exists/);
});

test('a half-typed folder name survives a sidebar refresh from another window', async () => {
  await win.click('#btn-new-folder');
  await win.fill('#note-tree .new-folder-input', 'Pend');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('vault-tree-changed'));
  await new Promise(r => setTimeout(r, 500));
  assert.equal(await win.inputValue('#note-tree .new-folder-input'), 'Pend');
  await win.press('#note-tree .new-folder-input', 'Enter');
  await folder('Pend').waitFor();
  assert.ok(sandbox.isDir('Pend'));
});

test('Escape cancels the new folder input', async () => {
  await win.click('#btn-new-folder');
  await win.waitForSelector('#note-tree .new-folder-input');
  await win.press('#note-tree .new-folder-input', 'Escape');
  assert.equal(await win.locator('#note-tree .new-folder-input').count(), 0);
});

test('"New note here" creates and opens a note inside that folder', async () => {
  await folderAction('Archive', 'new-note');
  await win.waitForFunction(() => /\.md$/.test(document.querySelector('#active-note-badge').textContent));
  const created = fs.readdirSync(path.join(sandbox.vault, 'Archive')).filter(f => f.endsWith('.md'));
  assert.equal(created.length, 1);
  assert.equal(await win.textContent('#active-note-badge'), created[0]);
});

test('dragging a note onto a folder moves the file, its history and keeps it open', async () => {
  await note('Ideas').click();
  await win.waitForSelector('#active-note-badge:text-is("Ideas.md")');
  await note('Ideas').dragTo(folder('Archive'));
  assert.ok(await waitFor(() => sandbox.exists('Archive/Ideas.md') && !sandbox.exists('Ideas.md')));
  assert.ok(fs.readdirSync(path.join(sandbox.vault, 'Archive', '.pinnote', 'history')).length > 0, 'history moved');

  // Still the open note, and edits now save to the new location
  await win.waitForSelector('#active-note-badge:text-is("Ideas.md")');
  await setEditor(win, '# Ideas\nmoved and edited');
  await win.dispatchEvent('#markdown-input', 'input');
  assert.ok(await waitFor(() => sandbox.read('Archive/Ideas.md').includes('moved and edited')));
  assert.equal(sandbox.exists('Ideas.md'), false);
});

test('moving onto a folder that already has that note name is refused', async () => {
  const dialog = nextDialog();
  await note('Ideas', 'Archive').dragTo(folder('Work'));
  assert.match(await dialog, /already exists/);
  assert.ok(sandbox.exists('Archive/Ideas.md'));
  assert.equal(sandbox.read('Work/Ideas.md'), '# Work ideas\n');
});

test('dropping a note on the empty area of the list moves it back to the vault root', async () => {
  const tree = await win.locator('#note-tree').boundingBox();
  await note('Sprint', 'Work').dragTo(win.locator('#note-tree'), { targetPosition: { x: tree.width / 2, y: tree.height - 8 } });
  assert.ok(await waitFor(() => sandbox.exists('Sprint.md') && !sandbox.exists('Work/Sprint.md')));
});

test('with a folder focused, Ctrl+N creates the note in that folder', async () => {
  const workNotes = () => fs.readdirSync(path.join(sandbox.vault, 'Work')).filter(f => f.endsWith('.md')).length;
  const before = workNotes();
  await folderAction('Work', 'scope');
  await win.keyboard.press('Control+n');
  assert.ok(await waitFor(() => workNotes() === before + 1), `expected ${before + 1} notes in Work`);
  assert.equal(sandbox.list().filter(f => f.endsWith('.md')).length, 1, 'nothing new at the vault root');
  await win.click('#btn-clear-scope');
});

test('no renderer errors were thrown', () => {
  assert.deepEqual(pageErrors, []);
});
