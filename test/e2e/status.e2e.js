const test = require('node:test');
const assert = require('node:assert/strict');
const { makeSandbox, launchApp, setEditor, waitFor } = require('./helpers');

let sandbox;
let app;
let win;
let pageErrors;

const item = (title) => win.locator(`#note-tree .note-item:has(.note-title:text-is("${title}"))`);
const statusOf = async (title) => {
  const badge = item(title).locator('.note-status');
  return (await badge.count()) ? badge.getAttribute('data-status') : null;
};
const visibleTitles = () => win.locator('#note-tree .note-title').allTextContents();

const openNote = async (title) => {
  await item(title).click();
  await win.waitForSelector(`#active-note-badge:text-is("${title}.md")`);
  await win.waitForSelector('#save-status-indicator.saved');
};

test.before(async () => {
  sandbox = makeSandbox({
    'Alpha.md': '# Alpha\n',
    'Beta.md': '---\nstatus: waiting\n---\n# Beta\n',
    'Gamma.md': '---\nstatus: done\n---\n# Gamma\n'
  });
  ({ app, win, pageErrors } = await launchApp(sandbox));
});

test.after(async () => {
  await app?.close();
  sandbox?.cleanup();
});

test('statuses from front-matter show as sidebar badges on launch', async () => {
  assert.equal(await statusOf('Alpha'), null);
  assert.equal(await statusOf('Beta'), 'waiting');
  assert.equal(await statusOf('Gamma'), 'done');
  assert.equal(await item('Beta').locator('.note-status').textContent(), 'Waiting');
});

test('choosing a status writes front-matter and updates the badge', async () => {
  await openNote('Alpha');
  assert.equal(await win.inputValue('#note-status'), '');
  await win.selectOption('#note-status', 'todo');
  assert.ok(await waitFor(() => sandbox.read('Alpha.md') === '---\nstatus: todo\n---\n# Alpha\n'), sandbox.read('Alpha.md'));
  assert.equal(await statusOf('Alpha'), 'todo');
  // The preview shows the note, not its metadata
  assert.doesNotMatch(await win.textContent('#markdown-preview'), /status/);
});

test('the Open filter lists only unfinished notes with a count', async () => {
  assert.match(await win.textContent('#filter-open'), /Open\D*2/);
  await win.click('#filter-open');
  assert.deepEqual((await visibleTitles()).sort(), ['Alpha', 'Beta']);
  await win.click('#filter-all');
  assert.deepEqual((await visibleTitles()).sort(), ['Alpha', 'Beta', 'Gamma']);
});

test('editing the status line by hand keeps the picker and badge in sync', async () => {
  await setEditor(win, '---\nstatus: done\n---\n# Alpha\n');
  await win.dispatchEvent('#markdown-input', 'input');
  await win.waitForSelector('#save-status-indicator.saved');
  assert.equal(await win.inputValue('#note-status'), 'done');
  assert.equal(await statusOf('Alpha'), 'done');
  assert.match(await win.textContent('#filter-open'), /Open\D*1/);
});

test('clearing the status removes the front-matter again', async () => {
  await win.selectOption('#note-status', '');
  assert.ok(await waitFor(() => sandbox.read('Alpha.md') === '# Alpha\n'), sandbox.read('Alpha.md'));
  assert.equal(await statusOf('Alpha'), null);
});

test('a status change made in a sticky window reaches the sidebar', async () => {
  await openNote('Gamma');
  const [sticky] = await Promise.all([app.waitForEvent('window'), win.click('#btn-popout-note')]);
  await sticky.waitForFunction(() => document.querySelector('#sticky-input').value.includes('Gamma'));
  await sticky.evaluate(() => {
    const el = document.querySelector('#sticky-input');
    el.value = el.value.replace('status: done', 'status: doing');
    el.dispatchEvent(new Event('input'));
  });
  await win.waitForFunction(() => document.querySelector('#note-tree .note-item.active .note-status')?.dataset.status === 'doing');
  assert.equal(await win.inputValue('#note-status'), 'doing');
  const closed = sticky.waitForEvent('close');
  await sticky.click('#sticky-close');
  await closed;
});

test('the Open filter is remembered across reloads', async () => {
  await win.click('#filter-open');
  await win.reload();
  await win.waitForSelector('#note-tree .note-item');
  assert.equal(await win.getAttribute('#filter-open', 'aria-pressed'), 'true');
  assert.deepEqual((await visibleTitles()).sort(), ['Beta', 'Gamma']);
  await win.click('#filter-all');
});

test('no renderer errors were thrown', () => {
  assert.deepEqual(pageErrors, []);
});
