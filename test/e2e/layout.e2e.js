const test = require('node:test');
const assert = require('node:assert/strict');
const { makeSandbox, launchApp } = require('./helpers');

let sandbox;
let app;
let win;
let pageErrors;

const sidebarWidth = async () => (await win.locator('#sidebar').boundingBox()).width;

test.before(async () => {
  sandbox = makeSandbox({ 'Alpha.md': '# Alpha\n' });
  ({ app, win, pageErrors } = await launchApp(sandbox));
});

test.after(async () => {
  await app?.close();
  sandbox?.cleanup();
});

test('dragging the sidebar edge resizes it', async () => {
  const before = await sidebarWidth();
  const handle = await win.locator('#sidebar-resizer').boundingBox();
  const y = handle.y + handle.height / 2;
  await win.mouse.move(handle.x + handle.width / 2, y);
  await win.mouse.down();
  await win.mouse.move(handle.x + handle.width / 2 + 60, y, { steps: 4 });
  await win.mouse.move(handle.x + handle.width / 2 + 120, y, { steps: 4 });
  await win.mouse.up();
  const after = await sidebarWidth();
  assert.ok(Math.abs(after - before - 120) <= 2, `expected +120px, got ${before} -> ${after}`);
});

test('the sidebar width is clamped so the editor keeps room', async () => {
  const handle = await win.locator('#sidebar-resizer').boundingBox();
  const y = handle.y + handle.height / 2;
  await win.mouse.move(handle.x + 2, y);
  await win.mouse.down();
  await win.mouse.move(5000, y, { steps: 4 });
  await win.mouse.up();
  const vw = await win.evaluate(() => window.innerWidth);
  assert.ok(await sidebarWidth() <= vw * 0.6 + 1);

  await win.mouse.move((await win.locator('#sidebar-resizer').boundingBox()).x + 2, y);
  await win.mouse.down();
  await win.mouse.move(0, y, { steps: 4 });
  await win.mouse.up();
  assert.ok(await sidebarWidth() >= 190, `too narrow: ${await sidebarWidth()}`);
});

test('arrow keys resize, double-click resets to the default width', async () => {
  await win.dblclick('#sidebar-resizer');
  const base = await sidebarWidth();
  assert.ok(Math.abs(base - 280) <= 2, `default width ${base}`);
  await win.focus('#sidebar-resizer');
  await win.keyboard.press('ArrowRight');
  await win.keyboard.press('ArrowRight');
  assert.ok(await sidebarWidth() > base);
  assert.equal(await win.getAttribute('#sidebar-resizer', 'aria-valuenow'), String(Math.round(await sidebarWidth())));
});

test('the chosen width survives a reload', async () => {
  const width = await sidebarWidth();
  await win.reload();
  await win.waitForSelector('#note-tree .note-item');
  assert.ok(Math.abs(await sidebarWidth() - width) <= 1);
});

test('the resize handle is hidden while the sidebar is collapsed', async () => {
  await win.click('#btn-toggle-sidebar');
  assert.equal(await win.isVisible('#sidebar-resizer'), false);
  await win.click('#btn-toggle-sidebar');
  assert.equal(await win.isVisible('#sidebar-resizer'), true);
});

test('no renderer errors were thrown', () => {
  assert.deepEqual(pageErrors, []);
});
