/**
 * PinNote - Words near the caret, for the Ctrl + Space spelling fix.
 * Pure text logic (no DOM) so it is unit-tested directly.
 */

// Letters (any script) with inner apostrophes: don't, don’t, naïve
const WORD_RE = /[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*/gu;
const FENCE_RE = /^\s{0,3}(```|~~~)/;
// Code, links and markup, where spelling does not apply
const SKIP_RES = [
  /(`+)[^`\n]*?\1/g,                 // inline code
  /\b(?:https?:\/\/|www\.)\S+/g,     // bare URLs
  /\[\[[^\]\n]*\]\]/g,               // [[wiki links]]
  /\]\([^)\n]*\)/g,                  // [text](link target)
  /<\/?[A-Za-z][^>\n]*>/g            // HTML tags
];
// A word glued to digits or underscores (10px, snake_case) is not prose
const JOINED_RE = /[\p{N}_]/u;
const MAX_WORD_LENGTH = 64;

/** Sorted, non-overlapping [start, end) ranges to leave alone */
function skippedRanges(text) {
  const ranges = [];
  let offset = 0;
  let fenceStart = -1;
  for (const line of text.split('\n')) {
    if (FENCE_RE.test(line)) {
      if (fenceStart < 0) {
        fenceStart = offset;
      } else {
        ranges.push([fenceStart, offset + line.length]);
        fenceStart = -1;
      }
    }
    offset += line.length + 1;
  }
  // An unclosed fence runs to the end of the note
  if (fenceStart >= 0) ranges.push([fenceStart, text.length]);

  for (const re of SKIP_RES) {
    for (const m of text.matchAll(re)) ranges.push([m.index, m.index + m[0].length]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  return merged;
}

/**
 * Words at or before the caret, nearest first. The word the caret is in (or touching) comes first.
 * @returns {{ word: string, start: number, end: number }[]}
 */
function wordsNearCaret(text, caret, { limit = 30 } = {}) {
  const skipped = skippedRanges(text);
  let next = 0;

  const words = [];
  for (const m of text.matchAll(WORD_RE)) {
    const start = m.index;
    if (start > caret) break;
    const end = start + m[0].length;
    // Words arrive in order, so walk the sorted ranges alongside them
    while (next < skipped.length && skipped[next][1] <= start) next++;
    const inSkipped = next < skipped.length && skipped[next][0] < end;
    const joined = JOINED_RE.test(text[start - 1] || '') || JOINED_RE.test(text[end] || '');
    if (!inSkipped && !joined && m[0].length <= MAX_WORD_LENGTH) words.push({ word: m[0], start, end });
  }
  return words.slice(-limit).reverse();
}

export { wordsNearCaret };
