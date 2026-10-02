/**
 * PinNote - Pure text & path helpers
 * Shared by the main process, the preload bridge and the test suite (no DOM, no Electron)
 */

const nodePath = require('path');

const FENCE_RE = /^\s*(?:>\s*)*(```|~~~)/;
// Same rule as marked: "[ ]" only renders as a checkbox when a space follows it
const TASK_LINE_RE = /^(\s*(?:>\s*)*)([-*+]|\d+[.)])\s+\[[ xX]\](?= )/;

/**
 * Yield [lineIndex, line] for every line that is not inside a fenced code block
 */
function* linesOutsideFences(lines) {
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(FENCE_RE);
    if (match) {
      if (!fence) fence = match[1];
      else if (match[1] === fence) fence = null;
      continue;
    }
    if (!fence) yield [i, lines[i]];
  }
}

/**
 * Toggle the Nth rendered task checkbox in raw markdown text.
 * Indexing matches the preview: tasks inside fenced code blocks are not counted.
 */
function toggleTaskCheckbox(markdownText, checkboxIndex, isChecked) {
  const lines = markdownText.split('\n');
  let count = 0;

  for (const [i, line] of linesOutsideFences(lines)) {
    if (!TASK_LINE_RE.test(line)) continue;
    if (count === checkboxIndex) {
      lines[i] = isChecked
        ? line.replace(/\[ \]/, '[x]')
        : line.replace(/\[[xX]\]/, '[ ]');
      break;
    }
    count++;
  }

  return lines.join('\n');
}

/**
 * Extract unique #tags, ignoring code, headings, URL anchors and pure numbers (#123)
 */
function extractTags(markdownText) {
  if (!markdownText) return [];
  const tags = new Set();
  const tagRe = /(^|\s)#([\p{L}\p{N}_\-/]+)/gu;

  for (const [, rawLine] of linesOutsideFences(markdownText.split('\n'))) {
    const line = rawLine.replace(/`[^`]*`/g, ' ');
    for (const match of line.matchAll(tagRe)) {
      const name = match[2].replace(/\/+$/, '');
      if (name && !/^\d+$/.test(name)) tags.add(`#${name}`);
    }
  }
  return [...tags];
}

/**
 * Flatten a vault tree (directories with children) into a list of note files
 */
function flattenNoteFiles(items = []) {
  const files = [];
  for (const item of items) {
    if (item.type === 'file') files.push(item);
    else if (item.type === 'directory') files.push(...flattenNoteFiles(item.children));
  }
  return files;
}

function noteTitle(fileName) {
  return String(fileName).replace(/\.(md|txt)$/i, '');
}

/**
 * Find the note a [[wiki link]] points to: a vault-relative path ("work/Plan") first, then the
 * bare title, then the sanitized title (so [[What?]] finds the What.md it created).
 */
function findNoteByTitle(files = [], target) {
  const normalize = (p) => noteTitle(String(p)).replace(/\\/g, '/').trim().toLowerCase();
  const wanted = normalize(target ?? '');
  if (!wanted) return null;
  const sanitized = sanitizeNoteName(wanted).toLowerCase();

  return files.find(f => normalize(f.relativePath || f.name) === wanted)
    || files.find(f => normalize(f.name) === wanted)
    || files.find(f => normalize(f.name) === sanitized)
    || null;
}

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

/**
 * Make a user-supplied note name safe to use as a single file name inside the vault
 */
function sanitizeNoteName(name) {
  let clean = String(name ?? '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
    .replace(/^[\s.]+|[\s.]+$/g, '')
    .trim();
  if (clean.startsWith('..')) clean = clean.replace(/^\.+/, '');
  if (WINDOWS_RESERVED.test(clean)) clean = `_${clean}`;
  return clean;
}

/**
 * True when `child` resolves to a location strictly inside `parent`
 */
function isPathInside(child, parent, pathImpl = nodePath) {
  if (!child || !parent) return false;
  const caseInsensitive = pathImpl.sep === '\\';
  const norm = (p) => {
    const resolved = pathImpl.resolve(p);
    return caseInsensitive ? resolved.toLowerCase() : resolved;
  };
  const rel = pathImpl.relative(norm(parent), norm(child));
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${pathImpl.sep}`) && !pathImpl.isAbsolute(rel);
}

module.exports = {
  toggleTaskCheckbox,
  extractTags,
  flattenNoteFiles,
  noteTitle,
  sanitizeNoteName,
  isPathInside,
  findNoteByTitle
};
