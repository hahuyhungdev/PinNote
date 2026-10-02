const { test } = require('node:test');
const assert = require('node:assert/strict');

// The filter module is a browser ES module; load it the same way the renderer does
const load = () => import('../src/modules/note-filter.js');

const file = (relativePath, status = null) => ({
  type: 'file',
  name: relativePath.split('/').pop(),
  path: `/v/${relativePath}`,
  relativePath,
  status
});
const dir = (relativePath, children) => ({
  type: 'directory',
  name: relativePath.split('/').pop(),
  path: `/v/${relativePath}`,
  relativePath,
  children
});

const vault = () => [
  file('Zeta.md'),
  dir('Work', [
    file('Work/Sprint.md', 'doing'),
    dir('Work/Clients', [
      file('Work/Clients/Globex.md', 'todo'),
      file('Work/Clients/Acme.md', 'waiting')
    ])
  ]),
  file('Ideas.md'),
  dir('Personal', [file('Personal/Groceries.md', 'done')]),
  dir('Empty', [])
];

const shape = (nodes) => nodes.map(n => n.type === 'directory'
  ? { [n.name]: [n.count, shape(n.children)] }
  : n.name);

test('matchesStatus understands all, open and single statuses', async () => {
  const { matchesStatus } = await load();
  assert.equal(matchesStatus(null, 'all'), true);
  assert.equal(matchesStatus('waiting', 'open'), true);
  assert.equal(matchesStatus('done', 'open'), false);
  assert.equal(matchesStatus(null, 'open'), false);
  assert.equal(matchesStatus('todo', 'todo'), true);
  assert.equal(matchesStatus('doing', 'todo'), false);
});

test('buildTreeView sorts folders first, counts notes and keeps empty folders when unfiltered', async () => {
  const { buildTreeView } = await load();
  assert.deepEqual(shape(buildTreeView(vault())), [
    { Empty: [0, []] },
    { Personal: [1, ['Groceries.md']] },
    { Work: [3, [{ Clients: [2, ['Acme.md', 'Globex.md']] }, 'Sprint.md']] },
    'Ideas.md',
    'Zeta.md'
  ]);
});

test('buildTreeView prunes folders with no matching notes when a status is chosen', async () => {
  const { buildTreeView } = await load();
  assert.deepEqual(shape(buildTreeView(vault(), { status: 'open' })), [
    { Work: [3, [{ Clients: [2, ['Acme.md', 'Globex.md']] }, 'Sprint.md']] }
  ]);
  assert.deepEqual(shape(buildTreeView(vault(), { status: 'waiting' })), [
    { Work: [1, [{ Clients: [1, ['Acme.md']] }]] }
  ]);
});

test('buildTreeView narrows to a folder scope (including subfolders) and to #tag matches', async () => {
  const { buildTreeView } = await load();
  assert.deepEqual(shape(buildTreeView(vault(), { scope: '/v/Work' })), [
    { Clients: [2, ['Acme.md', 'Globex.md']] },
    'Sprint.md'
  ]);
  assert.deepEqual(shape(buildTreeView(vault(), { scope: '/v/Work', status: 'todo' })), [
    { Clients: [1, ['Globex.md']] }
  ]);
  assert.deepEqual(shape(buildTreeView(vault(), { tagMatches: ['/v/Ideas.md', '/v/Work/Sprint.md'] })), [
    { Work: [1, ['Sprint.md']] },
    'Ideas.md'
  ]);
  // A scope that no longer exists falls back to the whole vault
  assert.equal(buildTreeView(vault(), { scope: '/v/Gone' }).length, 5);
});

test('countByStatus counts every status and open notes within a scope', async () => {
  const { countByStatus } = await load();
  assert.deepEqual(countByStatus(vault()), { all: 6, open: 3, todo: 1, doing: 1, waiting: 1, done: 1 });
  assert.deepEqual(countByStatus(vault(), '/v/Work/Clients'), { all: 2, open: 2, todo: 1, doing: 0, waiting: 1, done: 0 });
});

test('findFolder locates nested folders and lists ancestors for the breadcrumb', async () => {
  const { findFolder, folderTrail } = await load();
  assert.equal(findFolder(vault(), '/v/Work/Clients')?.name, 'Clients');
  assert.equal(findFolder(vault(), '/v/Nope'), null);
  assert.deepEqual(folderTrail(vault(), '/v/Work/Clients').map(f => f.name), ['Work', 'Clients']);
  assert.deepEqual(folderTrail(vault(), '/v/Nope'), []);
});
