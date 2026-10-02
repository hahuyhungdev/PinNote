const test = require('node:test');
const assert = require('node:assert/strict');
const { makeSandbox, launchApp, setEditor } = require('./helpers');

let sandbox;
let app;
let win;
let pageErrors;

const filler = (n) => Array.from({ length: n }, (_, i) => `Paragraph line ${i} with enough words to take some room.`).join('\n\n');
const NOTE = [
  '---', 'status: doing', '---',
  '# Sprint notes', filler(6),
  '## Goals', filler(14),
  '## Risks', filler(14),
  '### **Infra** risks', filler(14),
  '```', '# not a heading', '```',
  '## Wrap-up', filler(10)
].join('\n');

const items = () => win.locator('#outline-list .outline-item');
const offsetOf = (heading) => NOTE.indexOf(heading);

test.before(async () => {
  sandbox = makeSandbox({ 'Sprint.md': NOTE });
  ({ app, win, pageErrors } = await launchApp(sandbox));
  await win.waitForFunction(() => document.querySelector('#markdown-input').value.includes('Wrap-up'));
});

test.after(async () => {
  await app?.close();
  sandbox?.cleanup();
});

test('the Outline button shows the note headings, indented by level', async () => {
  assert.equal(await win.isVisible('#outline-pane'), false);
  await win.click('#btn-outline');
  await win.waitForSelector('#outline-pane:not([hidden])');
  assert.equal(await win.getAttribute('#btn-outline', 'aria-pressed'), 'true');
  assert.deepEqual(await items().allTextContents(), ['Sprint notes', 'Goals', 'Risks', 'Infra risks', 'Wrap-up']);
  assert.deepEqual(await items().evaluateAll(els => els.map(e => e.dataset.level)), ['1', '2', '2', '3', '2']);
});

test('clicking a heading jumps the editor and the preview to it', async () => {
  await items().nth(2).click(); // Risks
  const caret = await win.evaluate(() => document.querySelector('#markdown-input').selectionStart);
  assert.equal(caret, offsetOf('## Risks'));

  // The preview heading is scrolled to the top of the preview pane
  const gap = await win.evaluate(() => {
    const heading = [...document.querySelectorAll('#markdown-preview h2')].find(h => h.textContent === 'Risks');
    return heading.getBoundingClientRect().top - document.querySelector('#preview-wrapper').getBoundingClientRect().top;
  });
  assert.ok(gap >= -2 && gap < 60, `preview heading ${gap}px from the top`);

  // ...and the editor line is near the top of the textarea
  // ...and the editor shows the heading line first: scrolling one line less reveals the line above
  const editor = await win.evaluate(() => {
    const ta = document.querySelector('#markdown-input');
    return { scrollTop: ta.scrollTop, lineHeight: parseFloat(getComputedStyle(ta).lineHeight) };
  });
  assert.ok(editor.scrollTop > 0, 'editor scrolled');
  const firstVisibleLine = await win.evaluate((top) => {
    // Ask the browser which text is at the top-left of the textarea's visible area
    const ta = document.querySelector('#markdown-input');
    const box = ta.getBoundingClientRect();
    const style = getComputedStyle(ta);
    ta.setSelectionRange(0, 0);
    const probe = document.createElement('div');
    Object.assign(probe.style, { position: 'absolute', visibility: 'hidden', left: '-9999px', top: '0', boxSizing: 'border-box',
      width: `${ta.clientWidth}px`, whiteSpace: 'pre-wrap', overflowWrap: 'break-word', font: style.font, lineHeight: style.lineHeight,
      padding: style.padding });
    const lines = ta.value.split('\n');
    let offset = 0;
    for (const line of lines) {
      probe.textContent = ta.value.slice(0, offset);
      document.body.appendChild(probe);
      const y = probe.scrollHeight - parseFloat(style.paddingBottom);
      probe.remove();
      if (y > top) return line;
      offset += line.length + 1;
    }
    return null;
  }, editor.scrollTop);
  assert.equal(firstVisibleLine, '## Risks');
});

test('the section being read is highlighted while the preview scrolls', async () => {
  await win.evaluate(() => {
    const heading = [...document.querySelectorAll('#markdown-preview h3')].find(h => h.textContent.includes('Infra'));
    const pane = document.querySelector('#preview-wrapper');
    pane.scrollTop += heading.getBoundingClientRect().top - pane.getBoundingClientRect().top + 30;
  });
  await win.waitForFunction(() => document.querySelector('#outline-list [aria-current="true"]')?.textContent === 'Infra risks');
});

test('in Edit mode the outline follows the cursor', async () => {
  await win.click('#btn-mode-editor');
  await items().nth(1).click(); // Goals
  await win.waitForFunction(() => document.querySelector('#outline-list [aria-current="true"]')?.textContent === 'Goals');
  assert.equal(await win.evaluate(() => document.querySelector('#markdown-input').selectionStart), offsetOf('## Goals'));
  await win.click('#btn-mode-split');
});

test('the outline updates as headings are typed', async () => {
  const value = await win.inputValue('#markdown-input');
  await setEditor(win, `${value}\n## Next steps\n`);
  await win.dispatchEvent('#markdown-input', 'input');
  await win.waitForFunction(() => [...document.querySelectorAll('#outline-list .outline-item')].some(e => e.textContent === 'Next steps'));
});

test('Ctrl+Shift+O toggles the outline and the choice is remembered', async () => {
  await win.focus('#markdown-input');
  await win.keyboard.press('Control+Shift+O');
  assert.equal(await win.isVisible('#outline-pane'), false);
  await win.keyboard.press('Control+Shift+O');
  assert.equal(await win.isVisible('#outline-pane'), true);
  await win.reload();
  await win.waitForSelector('#outline-pane:not([hidden])');
});

test('a note without headings says so', async () => {
  await setEditor(win, 'just text');
  await win.dispatchEvent('#markdown-input', 'input');
  await win.waitForSelector('#outline-list .outline-empty');
});

test('no renderer errors were thrown', () => {
  assert.deepEqual(pageErrors, []);
});
