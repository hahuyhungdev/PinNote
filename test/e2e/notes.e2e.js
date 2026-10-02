const test = require('node:test');
const assert = require('node:assert/strict');
const { makeSandbox, launchApp, setEditor, waitFor } = require('./helpers');

let sandbox;
let app;
let win;
let pageErrors;
const editor = '#markdown-input';

const openNote = async (title) => {
  await win.click(`#note-tree .note-item:has(.note-title:text-is("${title}"))`);
  await win.waitForSelector(`#active-note-badge:text-is("${title}.md")`);
  await win.waitForSelector('#save-status-indicator.saved');
};

const typeAndSave = async (text) => {
  await setEditor(win, text);
  await win.dispatchEvent(editor, 'input');
  await win.waitForSelector('#save-status-indicator.saved');
};

test.before(async () => {
  sandbox = makeSandbox({
    'Alpha.md': '# Alpha\n\nbody\n',
    'Beta.md': '# Beta\n\n- [ ]\n- [ ] real task\n'
  });
  ({ app, win, pageErrors } = await launchApp(sandbox));
});

test.after(async () => {
  await app?.close();
  sandbox?.cleanup();
});

test('clicking the already-open note right after typing keeps the edit', async () => {
  await openNote('Alpha');
  await win.focus(editor);
  await win.evaluate((sel) => { const el = document.querySelector(sel); el.setSelectionRange(el.value.length, el.value.length); }, editor);
  await win.keyboard.type('UNSAVED');
  await win.click('#note-tree .note-item.active');
  await win.waitForSelector('#save-status-indicator.saved');
  assert.match(await win.inputValue(editor), /UNSAVED/);
  assert.ok(await waitFor(() => sandbox.read('Alpha.md').includes('UNSAVED')), 'edit should reach disk');
});

test('ticking a preview checkbox toggles that task, not an unrendered "- [ ]" line', async () => {
  await openNote('Beta');
  await win.click('#markdown-preview input[data-task]');
  assert.ok(await waitFor(() => sandbox.read('Beta.md').includes('- [x] real task')), sandbox.read('Beta.md'));
  assert.match(sandbox.read('Beta.md'), /^- \[ \]$/m);
});

test('a wiki link whose title has filename-illegal characters opens the same note every time', async () => {
  await openNote('Alpha');
  await typeAndSave('[[What?]]');
  await win.click('#markdown-preview .wiki-link');
  await win.waitForSelector('#active-note-badge:text-is("What.md")');

  await openNote('Alpha');
  await win.click('#markdown-preview .wiki-link');
  await win.waitForSelector('#active-note-badge:text-is("What.md")');
  assert.deepEqual(sandbox.list().filter(f => f.startsWith('What')), ['What.md']);
});

test('[[Target|alias]] shows the alias and links to Target', async () => {
  await openNote('Alpha');
  await typeAndSave('see [[Gamma|the alias]] and [[Alpha#Heading]]');
  const links = win.locator('#markdown-preview .wiki-link');
  assert.equal(await links.nth(0).textContent(), 'the alias');

  await links.nth(0).click();
  await win.waitForSelector('#active-note-badge:text-is("Gamma.md")');
  assert.ok(sandbox.exists('Gamma.md'));

  // [[Alpha#Heading]] goes to Alpha; a same-note [[#Local]] anchor creates nothing
  await openNote('Gamma');
  await typeAndSave('[[Alpha#Heading]] [[#Local]]');
  await win.locator('#markdown-preview .wiki-link').nth(0).click();
  await win.waitForSelector('#active-note-badge:text-is("Alpha.md")');
  await openNote('Gamma');
  await win.locator('#markdown-preview .wiki-link').nth(1).click();
  await new Promise(r => setTimeout(r, 500));
  assert.deepEqual(sandbox.list(), ['Alpha.md', 'Beta.md', 'Gamma.md', 'What.md']);
});

test('the save status stays visible at the default window size', async () => {
  const box = await win.locator('#save-status-indicator').boundingBox();
  const width = await win.evaluate(() => window.innerWidth);
  assert.ok(box && box.x + box.width <= width, `status right edge ${box && box.x + box.width} > ${width}`);
});

test('no renderer errors were thrown', () => {
  assert.deepEqual(pageErrors, []);
});
