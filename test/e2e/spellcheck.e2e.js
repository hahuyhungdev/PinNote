const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { makeSandbox, launchApp, setEditor, waitFor } = require('./helpers');

let sandbox;
let app;
let win;
let pageErrors;
const editor = '#markdown-input';

const readSettings = () => JSON.parse(fs.readFileSync(path.join(sandbox.userData, 'settings.json'), 'utf-8'));
const spellcheckOn = () => app.evaluate(({ session }) => session.defaultSession.isSpellCheckerEnabled());

/** Record context menus instead of showing native ones, which would block the test */
const captureMenus = () => app.evaluate(({ Menu }) => {
  globalThis.__menus = [];
  Menu.prototype.popup = function () { globalThis.__menus.push(this); };
});
// Role items get Electron's default label (e.g. "Paste"), so list labels and roles together
const lastMenuLabels = () => app.evaluate(() => (globalThis.__menus.at(-1)?.items || []).flatMap(i => [i.label, i.role]).filter(Boolean));
const clickLastMenuItem = (label) => app.evaluate((_, l) => globalThis.__menus.at(-1).items.find(i => i.label === l).click(), label);

/** Right-click the first word on the editor's first line */
async function rightClickFirstWord() {
  const point = await win.evaluate((sel) => {
    const el = document.querySelector(sel);
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      x: r.left + parseFloat(cs.paddingLeft) + 6,
      y: r.top + parseFloat(cs.paddingTop) + parseFloat(cs.lineHeight || cs.fontSize) / 2
    };
  }, editor);
  const before = await app.evaluate(() => globalThis.__menus.length);
  await win.mouse.click(point.x, point.y, { button: 'right' });
  // The context-menu event reaches the main process asynchronously
  const shown = await waitFor(() => app.evaluate((_, n) => globalThis.__menus.length > n, before));
  assert.ok(shown, 'expected a context menu');
}

test.before(async () => {
  sandbox = makeSandbox({ 'Scratch.md': '' });
  ({ app, win, pageErrors } = await launchApp(sandbox));
  await captureMenus();
});

test.after(async () => {
  await app?.close().catch(() => {});
  sandbox?.cleanup();
});

test('spell checking is on for the editor in English by default', async () => {
  assert.equal(await win.evaluate((sel) => document.querySelector(sel).spellcheck, editor), true);
  assert.equal(await spellcheckOn(), true);
  const languages = await app.evaluate(({ session }) => session.defaultSession.getSpellCheckerLanguages());
  assert.ok(languages.some(l => l.toLowerCase().startsWith('en')), `languages: ${languages}`);
});

test('right-clicking a misspelled word offers a fix that replaces it', async () => {
  await setEditor(win, '');
  await win.keyboard.type('teh cat ');
  // The dictionary loads asynchronously; retry until the word is flagged
  const labels = await waitFor(async () => {
    await rightClickFirstWord();
    const l = await lastMenuLabels();
    return l.includes('the') ? l : null;
  }, { timeout: 20000, interval: 500 });
  assert.ok(labels, 'expected a "the" suggestion for "teh"');
  assert.ok(labels.includes('Add "teh" to dictionary'));
  assert.ok(labels.includes('paste'));

  await clickLastMenuItem('the');
  await win.waitForFunction((sel) => document.querySelector(sel).value === 'the cat ', editor);
});

test('the "Check spelling" toggle turns spell checking off and on, and remembers it', async () => {
  await setEditor(win, 'cat');
  await rightClickFirstWord();
  assert.ok((await lastMenuLabels()).includes('Check spelling'));

  await clickLastMenuItem('Check spelling');
  assert.equal(await spellcheckOn(), false);
  assert.equal(readSettings().spellcheck, false);

  await rightClickFirstWord();
  await clickLastMenuItem('Check spelling');
  assert.equal(await spellcheckOn(), true);
  assert.equal(readSettings().spellcheck, true);
});

test('sticky windows check spelling too', async () => {
  const [sticky] = await Promise.all([app.waitForEvent('window'), win.click('#btn-popout-note')]);
  await sticky.waitForSelector('#sticky-status.saved');
  assert.equal(await sticky.evaluate(() => document.querySelector('#sticky-input').spellcheck), true);
  const closed = sticky.waitForEvent('close');
  await sticky.click('#sticky-close');
  await closed;
});

test('turning spelling off survives opening a sticky window', async () => {
  await setEditor(win, 'cat');
  await rightClickFirstWord();
  await clickLastMenuItem('Check spelling');
  assert.equal(await spellcheckOn(), false);

  const [sticky] = await Promise.all([app.waitForEvent('window'), win.click('#btn-popout-note')]);
  await sticky.waitForSelector('#sticky-status.saved');
  assert.equal(await spellcheckOn(), false);
  const closed = sticky.waitForEvent('close');
  await sticky.click('#sticky-close');
  await closed;

  await rightClickFirstWord();
  await clickLastMenuItem('Check spelling');
  assert.equal(await spellcheckOn(), true);
});

test('a saved "off" setting is applied on launch', async () => {
  await app.close();
  const settings = readSettings();
  fs.writeFileSync(path.join(sandbox.userData, 'settings.json'), JSON.stringify({ ...settings, spellcheck: false }), 'utf-8');
  ({ app, win, pageErrors } = await launchApp(sandbox));
  assert.equal(await spellcheckOn(), false);
  // Chromium can re-enable spell checking while it starts up; the saved choice must outlast that
  await new Promise(r => setTimeout(r, 3000));
  assert.equal(await spellcheckOn(), false);
  await captureMenus();
  await setEditor(win, 'cat');
  await rightClickFirstWord();
  const toggle = await app.evaluate(() => globalThis.__menus.at(-1).items.find(i => i.label === 'Check spelling').checked);
  assert.equal(toggle, false);
});

test('no page errors were raised', () => {
  assert.deepEqual(pageErrors, []);
});
