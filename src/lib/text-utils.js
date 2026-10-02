/**
 * PinNote - Pure text & path helpers
 * Shared by the main process, the preload bridge and the test suite (no DOM, no Electron)
 */

const nodePath = require('path');

const FENCE_RE = /^\s*(?:>\s*)*(```|~~~)/;
// Same rule as marked: "[ ]" only renders as a checkbox when a space follows it
const TASK_LINE_RE = /^(\s*(?:>\s*)*)([-*+]|\d+[.)])\s+\[[ xX]\](?= )/;

// ==========================================
// YAML front-matter & note status
// ==========================================

const NOTE_STATUSES = ['todo', 'doing', 'waiting', 'done'];

const STATUS_ALIASES = {
  todo: 'todo', 'to do': 'todo', 'to-do': 'todo',
  doing: 'doing', 'in progress': 'doing', 'in-progress': 'doing',
  waiting: 'waiting', blocked: 'waiting',
  done: 'done', complete: 'done', completed: 'done'
};

const FRONTMATTER_RE = /^(\uFEFF?)---[ \t]*\r?\n([\s\S]*?)(?:^|\r?\n)(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/;
const STATUS_LINE_RE = /^status[ \t]*:[ \t]*(.*?)[ \t]*$/im;

/** Length of a leading YAML front-matter block (0 when there is none) */
function frontmatterLength(text) {
  const match = FRONTMATTER_RE.exec(String(text ?? ''));
  return match ? match[0].length : 0;
}

function getNoteStatus(text) {
  const match = FRONTMATTER_RE.exec(String(text ?? ''));
  const line = match && STATUS_LINE_RE.exec(match[2]);
  if (!line) return null;
  const value = line[1].replace(/^["']|["']$/g, '').trim().toLowerCase();
  return STATUS_ALIASES[value] || null;
}

/**
 * Return `text` with its front-matter `status:` set to `status`, or removed when it is null.
 * Other front-matter properties and the note's line endings are left as they are.
 */
function setNoteStatus(text, status) {
  if (status !== null && !NOTE_STATUSES.includes(status)) throw new Error(`Unknown status: ${status}`);
  const source = String(text ?? '');
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const match = FRONTMATTER_RE.exec(source);

  if (!match) {
    return status ? `---${eol}status: ${status}${eol}---${eol}${source}` : source;
  }

  const [block, bom, inner] = match;
  const rest = source.slice(block.length);
  const lines = inner === '' ? [] : inner.split(/\r?\n/);
  const idx = lines.findIndex(l => STATUS_LINE_RE.test(l));

  if (status === null) {
    if (idx === -1) return source;
    lines.splice(idx, 1);
  } else if (idx === -1) {
    lines.unshift(`status: ${status}`);
  } else {
    lines[idx] = `status: ${status}`;
  }

  if (lines.length === 0) return bom + rest;
  return `${bom}---${eol}${lines.join(eol)}${eol}---${eol}${rest}`;
}

/**
 * Yield [lineIndex, line] for every line that is not inside front-matter or a fenced code block
 */
function* linesOutsideFences(lines) {
  let fence = null;
  // Skip a leading front-matter block: its lines are properties, not note text
  let first = 0;
  if (/^\uFEFF?---[ \t]*\r?$/.test(lines[0] ?? '')) {
    const close = lines.findIndex((l, i) => i > 0 && /^(?:---|\.\.\.)[ \t]*\r?$/.test(l));
    if (close !== -1) first = close + 1;
  }
  for (let i = first; i < lines.length; i++) {
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

// ATX heading: up to 3 spaces, optional blockquote markers, 1-6 #, a space, text, optional closing #s
const HEADING_RE = /^ {0,3}(?:>[ \t]?)*(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;

/** Heading text as the preview shows it: inline Markdown and HTML removed */
function plainHeadingText(text) {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/(^|\W)_(.+?)_(?=\W|$)/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Headings for the outline, skipping front-matter and fenced code.
 * `offset` is the index in `markdownText` where the heading line starts.
 * @returns {{level: number, text: string, line: number, offset: number}[]}
 */
function extractHeadings(markdownText) {
  const lines = String(markdownText ?? '').split('\n');
  const offsets = [];
  let pos = 0;
  for (const line of lines) {
    offsets.push(pos);
    pos += line.length + 1;
  }

  const headings = [];
  for (const [i, raw] of linesOutsideFences(lines)) {
    const match = HEADING_RE.exec(raw.replace(/\r$/, ''));
    const text = match && plainHeadingText(match[2] || '');
    if (text) headings.push({ level: match[1].length, text, line: i, offset: offsets[i] });
  }
  return headings;
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

/**
 * Resolve [[link]] text: the whole text may be a title containing "#" ("Meeting #3"); otherwise
 * "#..." is a heading. Returns the note to open, or the title to create (null for a same-note anchor).
 */
function resolveWikiLink(files, link) {
  const full = String(link ?? '').trim();
  const title = full.split('#')[0].trim();
  const note = (full && findNoteByTitle(files, full)) || (title && findNoteByTitle(files, title)) || null;
  return { note, title: note || !title ? null : title };
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
  findNoteByTitle,
  resolveWikiLink,
  NOTE_STATUSES,
  getNoteStatus,
  setNoteStatus,
  frontmatterLength,
  extractHeadings
};
