/**
 * Offline English spelling for the Ctrl + Space fix (Hunspell dictionary via nspell).
 * Chromium's underlines come from the Windows spell checker, which the page cannot query,
 * so the main process answers "is this misspelled?" and "what are the fixes?" itself.
 */

const fs = require('fs');
const path = require('path');
const nspell = require('nspell');

const DEFAULT_LIMIT = 5;
// nspell's search can take a few hundred ms on unknown words; longer ones are not worth the wait
const MAX_SUGGEST_LENGTH = 30;
const CACHE_SIZE = 500;
// dictionary-en is an ES module that blocks subpath imports; read its files directly
const DICTIONARY_DIR = path.join(__dirname, '..', '..', 'node_modules', 'dictionary-en');

const MAX_WORD_LENGTH = 64;
// Same shape as the renderer's words (src/modules/spell-words.js): letters with inner apostrophes
const WORD_SHAPE = /^[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*$/u;

/** Guards the IPC boundary: only a single, reasonably short word may be checked or learned */
const isCheckableWord = (word) =>
  typeof word === 'string' && word.length <= MAX_WORD_LENGTH && WORD_SHAPE.test(word);

const straight = (word) => String(word).replace(/’/g, "'");
const isAcronym = (word) => /^[A-Z]{2,}$/.test(word);

function loadEnglishDictionary() {
  return {
    aff: fs.readFileSync(path.join(DICTIONARY_DIR, 'index.aff')),
    dic: fs.readFileSync(path.join(DICTIONARY_DIR, 'index.dic'))
  };
}

/** Edit distance where swapping two neighbouring letters counts as one edit */
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

const isSwap = (a, b) => {
  if (a.length !== b.length) return false;
  const diff = [...a].flatMap((ch, i) => (ch === b[i] ? [] : [i]));
  return diff.length === 2 && diff[1] === diff[0] + 1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]];
};

const casePattern = (word) => {
  if (word === word.toLowerCase()) return 'lower';
  if (word.length > 1 && word === word.toUpperCase()) return 'upper';
  if (word[0] === word[0].toUpperCase() && word.slice(1) === word.slice(1).toLowerCase()) return 'title';
  return 'mixed';
};

/** Lower is likelier: typing slips (swapped letters, a missing apostrophe) beat other edits */
function typoScore(word, candidate) {
  const a = word.toLowerCase();
  const b = candidate.toLowerCase();
  let score;
  if (a === b.replace(/'/g, '') && a !== b) score = 0;
  else if (isSwap(a, b)) score = 0.5;
  else score = editDistance(a, b);
  if (casePattern(candidate) !== casePattern(word)) score += 0.5;
  if (a[0] !== b[0]) score += 0.1;
  return score + 0.05 * Math.abs(a.length - b.length);
}

/** Order candidates from likeliest to least likely fix, without duplicates */
function rankSuggestions(word, candidates) {
  return [...new Set(candidates)]
    .map((candidate, index) => ({ candidate, index, score: typoScore(word, candidate) }))
    .sort((x, y) => x.score - y.score || x.index - y.index)
    .map(({ candidate }) => candidate);
}

/** Give a lowercase suggestion the typed word's capitalisation: Teh -> The, TEH -> THE */
function matchCase(word, suggestion) {
  if (casePattern(suggestion) !== 'lower') return suggestion;
  const pattern = casePattern(word);
  if (pattern === 'upper') return suggestion.toUpperCase();
  if (pattern === 'title') return suggestion[0].toUpperCase() + suggestion.slice(1);
  return suggestion;
}

/**
 * @param {{ aff: Buffer, dic: Buffer, words?: string[] }} dictionary words are the user's own additions
 */
function createSpellChecker({ aff, dic, words = [] }) {
  const spell = nspell(aff, dic);
  for (const word of words) spell.add(straight(word));

  const cache = new Map();

  const isMisspelled = (word) => !isAcronym(word) && !spell.correct(straight(word));

  function rankedFixes(typed) {
    if (cache.has(typed)) return cache.get(typed);
    const fixes = typed.length > MAX_SUGGEST_LENGTH
      ? []
      : [...new Set(rankSuggestions(typed, spell.suggest(typed)).map(s => matchCase(typed, s)))];
    if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value);
    cache.set(typed, fixes);
    return fixes;
  }

  return {
    isMisspelled,
    suggest(word, limit = DEFAULT_LIMIT) {
      const curly = String(word).includes('’');
      const fixes = rankedFixes(straight(word)).map(s => (curly ? s.replace(/'/g, '’') : s));
      return [...new Set(fixes)].slice(0, limit);
    },
    add(word) {
      spell.add(straight(word));
      // A new word can change what counts as a fix
      cache.clear();
    }
  };
}

module.exports = { createSpellChecker, rankSuggestions, loadEnglishDictionary, isCheckableWord };
