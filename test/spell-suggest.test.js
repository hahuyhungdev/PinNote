const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSpellChecker, rankSuggestions, loadEnglishDictionary, isCheckableWord } = require('../src/lib/spell-suggest');

const checker = createSpellChecker(loadEnglishDictionary());

test('flags misspelled words and accepts real ones', () => {
  assert.equal(checker.isMisspelled('teh'), true);
  assert.equal(checker.isMisspelled('recieve'), true);
  assert.equal(checker.isMisspelled('the'), false);
  assert.equal(checker.isMisspelled("don't"), false);
  assert.equal(checker.isMisspelled('don’t'), false, 'curly apostrophes count as apostrophes');
});

test('acronyms in capitals are not treated as mistakes', () => {
  assert.equal(checker.isMisspelled('API'), false);
  assert.equal(checker.isMisspelled('JWT'), false);
});

test('the likely fix for a common typo comes first', () => {
  assert.equal(checker.suggest('teh')[0], 'the');
  assert.equal(checker.suggest('dont')[0], "don't");
  assert.equal(checker.suggest('recieve')[0], 'receive');
  assert.equal(checker.suggest('becuase')[0], 'because');
});

test('suggestions keep the capitalisation of the typed word', () => {
  assert.equal(checker.suggest('Teh')[0], 'The');
});

test('suggestions are capped', () => {
  assert.ok(checker.suggest('teh').length <= 5);
  assert.equal(checker.suggest('teh', 2).length, 2);
});

test('words added to the dictionary stop being flagged', () => {
  const own = createSpellChecker({ ...loadEnglishDictionary(), words: ['Zorblat'] });
  assert.equal(own.isMisspelled('Zorblat'), false);
  assert.equal(own.isMisspelled('Pinnotez'), true);
  own.add('Pinnotez');
  assert.equal(own.isMisspelled('Pinnotez'), false);
});

test('rankSuggestions prefers swapped letters and missing apostrophes over other edits', () => {
  assert.deepEqual(rankSuggestions('teh', ['ten', 'eh', 'tech', 'the']), ['the', 'ten', 'tech', 'eh']);
  assert.deepEqual(rankSuggestions('dont', ['cont', 'done', "don't"]), ["don't", 'done', 'cont']);
});

test('rankSuggestions prefers candidates in the same case and drops duplicates', () => {
  assert.deepEqual(rankSuggestions('teh', ['Ted', 'ted', 'ted']), ['ted', 'Ted']);
});

test('repeat lookups of a slow word are answered from a cache', () => {
  checker.suggest('Githubz');
  const started = Date.now();
  checker.suggest('Githubz');
  assert.ok(Date.now() - started < 20, `took ${Date.now() - started} ms`);
});

test('very long words get no suggestions instead of a slow search', () => {
  const started = Date.now();
  assert.deepEqual(checker.suggest('qwertzuiopasdfghjklyxcvbnmqwertzuiop'), []);
  assert.ok(Date.now() - started < 50, `took ${Date.now() - started} ms`);
});

test('only real words (letters with inner apostrophes, at most 64) may be checked or learned', () => {
  for (const ok of ['teh', "don't", 'don’t', 'naïve', 'Zorblat']) assert.equal(isCheckableWord(ok), true, ok);
  for (const bad of ['', 'two words', 'line\nbreak', 'a1', '<b>', "'quoted", 'x'.repeat(65), 42, null, ['teh']]) {
    assert.equal(isCheckableWord(bad), false, String(bad));
  }
});
