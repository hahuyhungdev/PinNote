const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { makeSandbox, launchApp, setEditor, waitFor } = require('./helpers');

test('a vault whose .pinnote folder links elsewhere cannot make PinNote write there', async (t) => {
  const sandbox = makeSandbox({ 'Note.md': '# Note\n' });
  const outside = path.join(sandbox.root, 'outside');
  fs.mkdirSync(outside);
  try {
    // A junction needs no special rights on Windows; a symlink elsewhere
    fs.symlinkSync(outside, path.join(sandbox.vault, '.pinnote'), process.platform === 'win32' ? 'junction' : 'dir');
  } catch (e) {
    sandbox.cleanup();
    return t.skip('cannot create a directory link here');
  }

  const { app, win, pageErrors } = await launchApp(sandbox);
  try {
    await setEditor(win, '# Note\nedited, which records a history snapshot\n');
    await win.dispatchEvent('#markdown-input', 'input');
    assert.ok(await waitFor(() => sandbox.read('Note.md').includes('edited')));
    await win.keyboard.press('Control+s');
    await new Promise(r => setTimeout(r, 500));
    assert.deepEqual(fs.readdirSync(outside), [], 'nothing written through the link');
    assert.ok(fs.readdirSync(path.join(sandbox.userData, 'note-history')).length > 0, 'history kept in app data instead');
    assert.deepEqual(pageErrors, []);
  } finally {
    await app.close();
    sandbox.cleanup();
  }
});
