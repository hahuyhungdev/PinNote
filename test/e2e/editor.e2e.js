const test = require('node:test');
const assert = require('node:assert/strict');
const { makeSandbox, launchApp, setEditor, selectedText } = require('./helpers');

let sandbox;
let app;
let win;
let pageErrors;
const editor = '#markdown-input';
const value = () => win.inputValue(editor);

test.before(async () => {
  sandbox = makeSandbox({ 'Scratch.md': '' });
  ({ app, win, pageErrors } = await launchApp(sandbox));
});

test.after(async () => {
  await app?.close();
  sandbox?.cleanup();
});

test('typing a closing bracket over an auto-inserted one does not duplicate it', async () => {
  await setEditor(win, '');
  await win.keyboard.type('- [ ] task');
  assert.equal(await value(), '- [ ] task');
});

test('quotes, parentheses and wiki brackets overtype their auto-inserted closers', async () => {
  await setEditor(win, '');
  await win.keyboard.type('say "hi" (ok) [[Link]] `code`');
  assert.equal(await value(), 'say "hi" (ok) [[Link]] `code`');
});

test('typing three backticks still builds a code fence', async () => {
  await setEditor(win, '');
  await win.keyboard.type('```js');
  assert.equal(await value(), '```js```');
});

test('Heading button replaces an existing heading level', async () => {
  await setEditor(win, '# Title', 3);
  await win.click('.fmt-btn[data-fmt="h2"]');
  assert.equal(await value(), '## Title');
});

test('a closer typed with no auto-inserted partner is still inserted', async () => {
  await setEditor(win, 'x');
  await win.keyboard.type(')');
  assert.equal(await value(), 'x)');
});

test('Code button selects the whole placeholder line', async () => {
  await setEditor(win, '');
  await win.click('.fmt-btn[data-fmt="code"]');
  assert.equal(await selectedText(win), '// code snippet');
});

test('Heading button prefixes the current line, not the cursor position', async () => {
  await setEditor(win, 'first line\nhello world', 14);
  await win.click('.fmt-btn[data-fmt="h1"]');
  assert.equal(await value(), 'first line\n# hello world');
});

test('List button prefixes every selected line', async () => {
  await setEditor(win, 'one\ntwo', 0, 7);
  await win.click('.fmt-btn[data-fmt="list"]');
  assert.equal(await value(), '- one\n- two');
});

test('Task button on an empty line inserts a placeholder task', async () => {
  await setEditor(win, '');
  await win.click('.fmt-btn[data-fmt="task"]');
  assert.equal(await value(), '- [ ] New task');
});

test('Enter on a list line replaces the selected text', async () => {
  await setEditor(win, '- apple pie', 7, 11);
  await win.keyboard.press('Enter');
  assert.equal(await value(), '- apple\n- ');
});

test('Heading button on a leading empty line with the cursor at 0', async () => {
  await setEditor(win, '\nbody', 0);
  await win.click('.fmt-btn[data-fmt="h1"]');
  assert.equal(await value(), '# Heading 1\nbody');
});

test('typing a quote before an opening quote inserts a pair instead of skipping it', async () => {
  await setEditor(win, '"abc"', 0);
  await win.keyboard.type('"');
  assert.equal(await value(), '"""abc"');
});

test('Enter with the item text selected keeps the bullet and continues the list', async () => {
  await setEditor(win, '- foo bar', 2, 9);
  await win.keyboard.press('Enter');
  assert.equal(await value(), '- \n- ');
});

test('no renderer errors were thrown', () => {
  assert.deepEqual(pageErrors, []);
});
