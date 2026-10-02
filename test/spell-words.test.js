const { test } = require('node:test');
const assert = require('node:assert/strict');

// spell-words is a browser ES module; load it the same way the renderer does
const load = () => import('../src/modules/spell-words.js');
const words = async (text, caret = text.length, options) =>
  (await load()).wordsNearCaret(text, caret, options).map(w => w.word);

test('lists words before the caret, nearest first', async () => {
  assert.deepEqual(await words('I wrote teh cat'), ['cat', 'teh', 'wrote', 'I']);
});

test('the word the caret is in or touching comes first, and later words are left out', async () => {
  assert.deepEqual(await words('one teh two', 5), ['teh', 'one']);
  assert.deepEqual(await words('one teh two', 7), ['teh', 'one']);
  assert.deepEqual(await words('one teh two', 4), ['teh', 'one']);
});

test('reports the exact range of each word', async () => {
  const { wordsNearCaret } = await load();
  assert.deepEqual(wordsNearCaret('I wrote teh cat', 15)[1], { word: 'teh', start: 8, end: 11 });
});

test('apostrophes stay inside words', async () => {
  assert.deepEqual(await words("we don't know"), ['know', "don't", 'we']);
  assert.deepEqual(await words('we don’t'), ['don’t', 'we']);
  assert.deepEqual(await words("'quoted'"), ['quoted']);
});

test('words with letters from other languages are kept whole', async () => {
  assert.deepEqual(await words('café naïve'), ['naïve', 'café']);
});

test('inline code, code blocks and links are skipped', async () => {
  assert.deepEqual(await words('run `npm instal` now'), ['now', 'run']);
  assert.deepEqual(await words('see https://exampel.com/pagee ok'), ['ok', 'see']);
  assert.deepEqual(await words('before\n```js\nconst teh = 1\n```\nafter'), ['after', 'before']);
  assert.deepEqual(await words('open\n```\nunclosd fence'), ['open'], 'an unclosed fence runs to the end');
});

test('only a limited number of words are looked at', async () => {
  const text = Array.from({ length: 100 }, (_, i) => `w${'a'.repeat(i % 5)}x`).join(' ');
  assert.equal((await load()).wordsNearCaret(text, text.length, { limit: 30 }).length, 30);
});

test('an empty note or a caret at the start gives no words', async () => {
  assert.deepEqual(await words(''), []);
  assert.deepEqual(await words('hello', 0), ['hello']);
  assert.deepEqual(await words(' hello', 0), []);
});

test('words joined to digits, wiki links, link targets and HTML tags are skipped', async () => {
  assert.deepEqual(await words('width 10px ok'), ['ok', 'width']);
  assert.deepEqual(await words('see [[Meetng notes]] ok'), ['ok', 'see']);
  assert.deepEqual(await words('read [the docs](docs/instal.md) ok'), ['ok', 'docs', 'the', 'read']);
  assert.deepEqual(await words('a <span class="x">b</span>'), ['b', 'a']);
});

test('over-long tokens are skipped instead of sent for checking', async () => {
  assert.deepEqual(await words(`ok ${'a'.repeat(80)}`), ['ok']);
});

test('large notes full of code spans and links stay fast', async () => {
  const { wordsNearCaret } = await load();
  const text = 'word `code` https://x.y/z '.repeat(30000);
  const started = Date.now();
  const found = wordsNearCaret(text, text.length);
  assert.equal(found.length, 30);
  assert.ok(Date.now() - started < 500, `took ${Date.now() - started} ms`);
});
