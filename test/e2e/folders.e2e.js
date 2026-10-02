const test = require('node:test');
const assert = require('node:assert/strict');
const { makeSandbox, launchApp } = require('./helpers');

let sandbox;
let app;
let win;
let pageErrors;

const folder = (name) => win.locator(`#note-tree .folder-item:has(.folder-name:text-is("${name}"))`);
const visibleTitles = async () => (await win.locator('#note-tree .note-title:visible').allTextContents()).sort();

test.before(async () => {
  sandbox = makeSandbox({
    'Ideas.md': '# Ideas\n',
    'Work/Sprint.md': '---\nstatus: doing\n---\n# Sprint\n',
    'Work/Clients/Acme.md': '---\nstatus: waiting\n---\n# Acme\n',
    'Work/Clients/Globex.md': '---\nstatus: todo\n---\n# Globex\n',
    'Personal/Groceries.md': '---\nstatus: done\n---\n# Groceries\n',
    'Empty/': null
  });
  ({ app, win, pageErrors } = await launchApp(sandbox));
});

test.after(async () => {
  await app?.close();
  sandbox?.cleanup();
});

test('notes are nested inside their folders with note counts', async () => {
  const clients = win.locator('#note-tree .folder-node:has(> .folder-item .folder-name:text-is("Clients"))');
  assert.deepEqual((await clients.locator('.note-title').allTextContents()).sort(), ['Acme', 'Globex']);
  assert.equal(await folder('Work').locator('.folder-count').textContent(), '3');
  assert.equal(await folder('Empty').count(), 1, 'empty folders are listed while unfiltered');
  assert.deepEqual(await visibleTitles(), ['Acme', 'Globex', 'Groceries', 'Ideas', 'Sprint']);
});

test('clicking a folder collapses it, and the choice survives a reload', async () => {
  await folder('Work').click();
  assert.equal(await folder('Work').getAttribute('aria-expanded'), 'false');
  assert.deepEqual(await visibleTitles(), ['Groceries', 'Ideas']);

  await win.reload();
  await win.waitForSelector('#note-tree .folder-item');
  assert.equal(await folder('Work').getAttribute('aria-expanded'), 'false');

  await folder('Work').click();
  assert.deepEqual(await visibleTitles(), ['Acme', 'Globex', 'Groceries', 'Ideas', 'Sprint']);
});

test('status chips show only notes with that status, inside the folders that hold them', async () => {
  assert.match(await win.textContent('#filter-waiting'), /Waiting\D*1/);
  await win.click('#filter-waiting');
  assert.deepEqual(await visibleTitles(), ['Acme']);
  assert.equal(await folder('Work').locator('.folder-count').textContent(), '1');
  assert.equal(await folder('Personal').count(), 0, 'folders without matches are hidden');

  await win.click('#filter-open');
  assert.deepEqual(await visibleTitles(), ['Acme', 'Globex', 'Sprint']);
  await win.click('#filter-all');
});

test('a folder can be focused so only its notes (and counts) are shown', async () => {
  await folder('Work').hover();
  await folder('Work').locator('[data-action="scope"]').click();
  assert.match(await win.textContent('#folder-scope'), /Work/);
  assert.deepEqual(await visibleTitles(), ['Acme', 'Globex', 'Sprint']);
  assert.match(await win.textContent('#filter-all'), /All\D*3/);

  // Focus + status combine: Work + To do
  await win.click('#filter-todo');
  assert.deepEqual(await visibleTitles(), ['Globex']);
  await win.click('#filter-all');

  await win.click('#btn-clear-scope');
  assert.equal(await win.isVisible('#folder-scope'), false);
  assert.deepEqual(await visibleTitles(), ['Acme', 'Globex', 'Groceries', 'Ideas', 'Sprint']);
});

test('text search lists matches flat with their folder, across all folders', async () => {
  await win.fill('#note-search-input', 'acme');
  await win.waitForFunction(() => document.querySelectorAll('#note-tree .note-title').length === 1);
  assert.equal(await win.locator('#note-tree .folder-item').count(), 0);
  assert.equal(await win.textContent('#note-tree .note-folder'), 'Work / Clients');
  await win.click('#btn-clear-search');
});

test('no renderer errors were thrown', () => {
  assert.deepEqual(pageErrors, []);
});
