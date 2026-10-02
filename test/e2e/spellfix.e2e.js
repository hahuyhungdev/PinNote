const test = require('node:test');
const assert = require('node:assert/strict');
const { makeSandbox, launchApp, setEditor, selectedText } = require('./helpers');

let sandbox;
let app;
let win;
let pageErrors;
const editor = '#markdown-input';
const value = () => win.inputValue(editor);
const caret = () => win.evaluate((sel) => document.querySelector(sel).selectionStart, editor);
const options = (page = win) => page.$$eval('#spell-fix [role="option"][data-word]', els => els.map(e => e.dataset.word));

async function openFix(page = win) {
  await page.keyboard.press('Control+Space');
  await page.waitForSelector('#spell-fix:not([hidden])');
}

test.before(async () => {
  sandbox = makeSandbox({ 'Scratch.md': '' });
  ({ app, win, pageErrors } = await launchApp(sandbox));
});

test.after(async () => {
  await app?.close().catch(() => {});
  sandbox?.cleanup();
});

test('Ctrl + Space on a misspelled word lists fixes, likeliest first, and Enter applies it', async () => {
  await setEditor(win, 'I wrote teh');
  await openFix();
  assert.equal((await options())[0], 'the');
  assert.equal(await selectedText(win), 'teh', 'the word being fixed is highlighted');
  await win.keyboard.press('Enter');
  assert.equal(await value(), 'I wrote the');
  assert.equal(await caret(), 'I wrote the'.length);
  assert.equal(await win.isHidden('#spell-fix'), true);
});

test('Ctrl + Space does not type a space into the note', async () => {
  await setEditor(win, 'all good');
  await openFix();
  await win.keyboard.press('Escape');
  assert.equal(await value(), 'all good');
});

test('it fixes the nearest mistake before the caret and puts the caret back', async () => {
  await setEditor(win, 'teh cat sat');
  await openFix();
  await win.keyboard.press('1');
  assert.equal(await value(), 'the cat sat');
  assert.equal(await caret(), 'the cat sat'.length);
});

test('Ctrl + Z undoes a fix', async () => {
  await setEditor(win, 'a recieve');
  await openFix();
  await win.keyboard.press('Enter');
  assert.equal(await value(), 'a receive');
  await win.keyboard.press('Control+z');
  assert.equal(await value(), 'a recieve');
});

test('arrow keys move the choice', async () => {
  await setEditor(win, 'teh');
  await openFix();
  const words = await options();
  await win.keyboard.press('ArrowDown');
  await win.keyboard.press('Enter');
  assert.equal(await value(), words[1]);
});

test('Escape closes the list without changing the note and restores the caret', async () => {
  await setEditor(win, 'teh cat');
  await openFix();
  await win.keyboard.press('Escape');
  assert.equal(await win.isHidden('#spell-fix'), true);
  assert.equal(await value(), 'teh cat');
  assert.equal(await caret(), 7);
  assert.equal(await selectedText(win), '');
});

test('typing another key closes the list and types at the caret as usual', async () => {
  await setEditor(win, 'teh cat');
  await openFix();
  await win.keyboard.type('s');
  assert.equal(await value(), 'teh cats');
  assert.equal(await win.isHidden('#spell-fix'), true);
});

test('with no mistakes nearby, a short message shows and then goes away', async () => {
  await setEditor(win, 'all good here');
  await openFix();
  assert.match(await win.textContent('#spell-fix'), /No spelling mistakes/);
  await win.waitForSelector('#spell-fix', { state: 'hidden', timeout: 4000 });
  assert.equal(await value(), 'all good here');
});

test('"Add to dictionary" stops the word being flagged again', async () => {
  await setEditor(win, 'Zorblatz');
  await openFix();
  await win.click('#spell-fix [data-action="learn"]');
  assert.equal(await win.isHidden('#spell-fix'), true);
  assert.equal(await value(), 'Zorblatz');
  const learned = await app.evaluate(({ session }) => session.defaultSession.listWordsInSpellCheckerDictionary());
  assert.ok(learned.includes('Zorblatz'));

  await setEditor(win, 'Zorblatz');
  await openFix();
  assert.match(await win.textContent('#spell-fix'), /No spelling mistakes/);
  await win.keyboard.press('Escape');
});

test('clicking in the editor closes the list, so Enter types a new line as usual', async () => {
  await setEditor(win, 'teh cat');
  await openFix();
  const box = await win.locator(editor).boundingBox();
  await win.mouse.click(box.x + box.width / 2, box.y + box.height - 20);
  assert.equal(await win.isHidden('#spell-fix'), true);
  await win.keyboard.press('Enter');
  assert.ok((await value()).startsWith('teh cat\n'), JSON.stringify(await value()));
});

test('with no suggestions, Enter does not add the typo to the dictionary', async () => {
  await setEditor(win, 'xqzvbnmlkjhgf');
  await openFix();
  assert.deepEqual(await options(), []);
  await win.keyboard.press('Enter');
  assert.equal(await win.isHidden('#spell-fix'), true);
  const learned = await app.evaluate(({ session }) => session.defaultSession.listWordsInSpellCheckerDictionary());
  assert.equal(learned.includes('xqzvbnmlkjhgf'), false);
});

test('if the note changes while the list is open, the stale fix is not applied', async () => {
  await setEditor(win, 'teh cat');
  await openFix();
  await win.evaluate((sel) => { document.querySelector(sel).value = 'something else entirely'; }, editor);
  await win.keyboard.press('Enter');
  assert.equal((await value()).includes('the'), false, JSON.stringify(await value()));
  assert.ok((await value()).startsWith('something else entirely'));
});

test('Ctrl + Space works in a sticky window too', async () => {
  await setEditor(win, '');
  const [sticky] = await Promise.all([app.waitForEvent('window'), win.click('#btn-popout-note')]);
  await sticky.waitForSelector('#sticky-status.saved');
  await setEditor(sticky, 'hello wrold', 11, 11, '#sticky-input');
  await openFix(sticky);
  assert.equal((await options(sticky))[0], 'world');
  await sticky.keyboard.press('Enter');
  assert.equal(await sticky.inputValue('#sticky-input'), 'hello world');
  const closed = sticky.waitForEvent('close');
  await sticky.click('#sticky-close');
  await closed;
});

test('no page errors were raised', () => {
  assert.deepEqual(pageErrors, []);
});
