const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  toggleTaskCheckbox,
  extractTags,
  flattenNoteFiles,
  noteTitle,
  sanitizeNoteName,
  isPathInside,
  findNoteByTitle,
  resolveWikiLink
} = require('../src/lib/text-utils');

test('toggleTaskCheckbox skips task-like lines inside fenced code blocks', () => {
  const md = [
    '```md',
    '- [ ] not a real task',
    '```',
    '- [ ] first real task',
    '- [ ] second real task'
  ].join('\n');

  const out = toggleTaskCheckbox(md, 0, true);
  assert.match(out, /- \[ \] not a real task/);
  assert.match(out, /- \[x\] first real task/);
  assert.match(out, /- \[ \] second real task/);
});

test('toggleTaskCheckbox handles tilde fences and + bullets', () => {
  const md = ['~~~', '* [ ] code', '~~~', '+ [ ] plus task'].join('\n');
  assert.match(toggleTaskCheckbox(md, 0, true), /\+ \[x\] plus task/);
});

test('toggleTaskCheckbox counts tasks inside blockquotes and callouts', () => {
  const md = ['> [!NOTE]', '> - [ ] quoted task', '- [ ] plain task'].join('\n');
  const out = toggleTaskCheckbox(md, 1, true);
  assert.match(out, /> - \[ \] quoted task/);
  assert.match(out, /- \[x\] plain task/);
});

test('toggleTaskCheckbox unchecks', () => {
  assert.equal(toggleTaskCheckbox('- [X] done', 0, false), '- [ ] done');
});

test('extractTags ignores code, headings, URL anchors and pure numbers', () => {
  const md = [
    '# Heading',
    'Real #work and #ideas/sub here.',
    'See https://example.com/page#section and issue #123.',
    'Inline `#notatag` code.',
    '```',
    '#include <stdio.h>',
    '```',
    '#work again'
  ].join('\n');

  assert.deepEqual(extractTags(md), ['#work', '#ideas/sub']);
});

test('extractTags supports unicode letters', () => {
  assert.deepEqual(extractTags('ghi chú #việc_làm'), ['#việc_làm']);
});

test('flattenNoteFiles returns files from nested folders', () => {
  const tree = [
    { type: 'file', name: 'a.md', path: '/v/a.md' },
    {
      type: 'directory',
      name: 'sub',
      children: [
        { type: 'file', name: 'b.md', path: '/v/sub/b.md' },
        { type: 'directory', name: 'deep', children: [{ type: 'file', name: 'c.txt', path: '/v/sub/deep/c.txt' }] }
      ]
    }
  ];
  assert.deepEqual(flattenNoteFiles(tree).map(f => f.name), ['a.md', 'b.md', 'c.txt']);
});

test('noteTitle strips .md and .txt extensions', () => {
  assert.equal(noteTitle('Plan.md'), 'Plan');
  assert.equal(noteTitle('log.txt'), 'log');
  assert.equal(noteTitle('v1.2 notes.md'), 'v1.2 notes');
});

test('sanitizeNoteName strips separators, traversal and reserved characters', () => {
  assert.equal(sanitizeNoteName('../../evil'), 'evil');
  assert.equal(sanitizeNoteName('a/b\\c'), 'abc');
  assert.equal(sanitizeNoteName('what? <now>: "x" | y*'), 'what now x  y');
  assert.equal(sanitizeNoteName('   '), '');
  assert.equal(sanitizeNoteName('...'), '');
  assert.equal(sanitizeNoteName('CON'), '_CON');
});

test('isPathInside confines paths to a root (win32, case-insensitive)', () => {
  const w = path.win32;
  assert.equal(isPathInside('C:\\Vault\\a.md', 'C:\\Vault', w), true);
  assert.equal(isPathInside('c:\\vault\\Sub\\b.md', 'C:\\Vault', w), true);
  assert.equal(isPathInside('C:\\Vault\\..\\evil.md', 'C:\\Vault', w), false);
  assert.equal(isPathInside('C:\\VaultEvil\\a.md', 'C:\\Vault', w), false);
  assert.equal(isPathInside('C:\\Vault', 'C:\\Vault', w), false);
});

test('isPathInside works with posix paths', () => {
  const p = path.posix;
  assert.equal(isPathInside('/v/a.md', '/v', p), true);
  assert.equal(isPathInside('/v/../x.md', '/v', p), false);
  assert.equal(isPathInside('/V/a.md', '/v', p), false);
});

test('isPathInside allows names that merely start with dots', () => {
  const w = path.win32;
  assert.equal(isPathInside('C:\\Vault\\..notes.md', 'C:\\Vault', w), true);
  assert.equal(isPathInside('C:\\Vault\\...\\x.md', 'C:\\Vault', w), true);
});

test('findNoteByTitle resolves wiki targets case-insensitively, by path, and by sanitized name', () => {
  const files = [
    { name: 'What.md', path: '/v/What.md', relativePath: 'What.md' },
    { name: 'Plan.md', path: '/v/work/Plan.md', relativePath: path.join('work', 'Plan.md') },
    { name: 'Plan.md', path: '/v/home/Plan.md', relativePath: path.join('home', 'Plan.md') },
    { name: 'notes.txt', path: '/v/notes.txt', relativePath: 'notes.txt' }
  ];
  assert.equal(findNoteByTitle(files, 'what')?.path, '/v/What.md');
  // "What?" was created as What.md because "?" is not allowed in file names
  assert.equal(findNoteByTitle(files, 'What?')?.path, '/v/What.md');
  assert.equal(findNoteByTitle(files, 'home/Plan')?.path, '/v/home/Plan.md');
  assert.equal(findNoteByTitle(files, 'Plan')?.path, '/v/work/Plan.md');
  assert.equal(findNoteByTitle(files, 'notes')?.path, '/v/notes.txt');
  assert.equal(findNoteByTitle(files, 'Missing'), null);
  assert.equal(findNoteByTitle(files, '  '), null);
});

test('resolveWikiLink prefers a title containing # and ignores pure anchors', () => {
  const files = [
    { name: 'Meeting #3.md', path: '/v/Meeting #3.md', relativePath: 'Meeting #3.md' },
    { name: 'Alpha.md', path: '/v/Alpha.md', relativePath: 'Alpha.md' }
  ];
  assert.equal(resolveWikiLink(files, 'Meeting #3').note?.path, '/v/Meeting #3.md');
  assert.equal(resolveWikiLink(files, 'Alpha#Intro').note?.path, '/v/Alpha.md');
  assert.deepEqual(resolveWikiLink(files, 'New#Part'), { note: null, title: 'New' });
  assert.deepEqual(resolveWikiLink(files, '#Heading'), { note: null, title: null });
  assert.deepEqual(resolveWikiLink(files, '  '), { note: null, title: null });
});
