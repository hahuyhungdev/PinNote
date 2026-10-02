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
  resolveWikiLink,
  NOTE_STATUSES,
  getNoteStatus,
  setNoteStatus,
  frontmatterLength,
  extractHeadings
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

test('NOTE_STATUSES lists the four statuses in workflow order', () => {
  assert.deepEqual(NOTE_STATUSES, ['todo', 'doing', 'waiting', 'done']);
});

test('getNoteStatus reads status from YAML front-matter only', () => {
  assert.equal(getNoteStatus('---\nstatus: todo\n---\n# A'), 'todo');
  assert.equal(getNoteStatus('---\ntitle: x\nStatus: "Doing"\n---\nbody'), 'doing');
  assert.equal(getNoteStatus('\uFEFF---\r\nstatus: waiting\r\n---\r\nbody'), 'waiting');
  assert.equal(getNoteStatus('---\nstatus: in progress\n---\n'), 'doing');
  assert.equal(getNoteStatus('---\nstatus: to do\n---\n'), 'todo');
  assert.equal(getNoteStatus('---\nstatus: whatever\n---\n'), null);
  assert.equal(getNoteStatus('# A\nstatus: done'), null, 'not front-matter');
  assert.equal(getNoteStatus('---\nstatus: done\nno closing fence'), null);
  assert.equal(getNoteStatus(''), null);
});

test('setNoteStatus adds, replaces and removes the status line', () => {
  assert.equal(setNoteStatus('# A\n', 'todo'), '---\nstatus: todo\n---\n# A\n');
  assert.equal(setNoteStatus('---\nstatus: todo\n---\n# A\n', 'done'), '---\nstatus: done\n---\n# A\n');
  assert.equal(setNoteStatus('---\ntitle: x\n---\n# A', 'doing'), '---\nstatus: doing\ntitle: x\n---\n# A');
  // Removing the only property drops the whole header; other properties are kept
  assert.equal(setNoteStatus('---\nstatus: todo\n---\n# A\n', null), '# A\n');
  assert.equal(setNoteStatus('---\ntitle: x\nstatus: todo\n---\n# A', null), '---\ntitle: x\n---\n# A');
  assert.equal(setNoteStatus('# A', null), '# A');
  // Windows line endings are preserved
  assert.equal(setNoteStatus('# A\r\nbody', 'waiting'), '---\r\nstatus: waiting\r\n---\r\n# A\r\nbody');
  assert.throws(() => setNoteStatus('# A', 'bogus'));
});

test('frontmatterLength measures the header so it can be hidden or skipped', () => {
  assert.equal(frontmatterLength('---\nstatus: todo\n---\n# A'), '---\nstatus: todo\n---\n'.length);
  assert.equal(frontmatterLength('# A\n---\nx\n---\n'), 0);
  assert.equal(frontmatterLength('---\nunterminated'), 0);
});

test('tasks and tags inside front-matter are ignored', () => {
  const md = '---\nstatus: todo\nnote: "#nottag"\n---\n- [ ] real #tag';
  assert.deepEqual(extractTags(md), ['#tag']);
  assert.match(toggleTaskCheckbox(md, 0, true), /- \[x\] real/);
});

test('extractHeadings lists ATX headings with level, line and offset', () => {
  const md = '# Sprint\n\nintro\n## Goals ##\n### Infra\n';
  assert.deepEqual(extractHeadings(md), [
    { level: 1, text: 'Sprint', line: 0, offset: 0 },
    { level: 2, text: 'Goals', line: 3, offset: 16 },
    { level: 3, text: 'Infra', line: 4, offset: 28 }
  ]);
});

test('extractHeadings skips front-matter, code, #tags, indented code and empty headings', () => {
  const md = [
    '---', 'status: todo', '---',
    '# Real',
    '```', '# not a heading', '```',
    '#tag line',
    '    # indented code',
    '#',
    '> ## Quoted',
    '   ### Three spaces ok'
  ].join('\n');
  assert.deepEqual(extractHeadings(md).map(h => [h.level, h.text, h.line]), [
    [1, 'Real', 3],
    [2, 'Quoted', 10],
    [3, 'Three spaces ok', 11]
  ]);
});

test('extractHeadings shows headings as plain text', () => {
  const md = '## **Bold** and `code` with [a link](https://x.y) and [[Note|alias]] and [[Plain]] ![img](a.png) <b>tag</b>';
  assert.equal(extractHeadings(md)[0].text, 'Bold and code with a link and alias and Plain img tag');
});

test('extractHeadings keeps offsets right with Windows line endings', () => {
  const md = '# A\r\ntext\r\n## B\r\n';
  const [, b] = extractHeadings(md);
  assert.equal(md.slice(b.offset, b.offset + 4), '## B');
});
