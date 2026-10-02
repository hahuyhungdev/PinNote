/**
 * PinNote - Outline (table of contents)
 * Lists the note's headings; clicking one jumps the editor and preview there, and the section
 * being read (preview scroll, or the cursor in Edit mode) is highlighted.
 */

import { extractHeadings } from './preview.js';

const STORAGE_KEY = 'pinnote_outline_open';
// A heading counts as "being read" once it is this close to the top of the preview
const ACTIVE_THRESHOLD = 48;

/** Copy the textarea's text layout into a hidden element to find where `offset` sits */
function textOffsetTop(textarea, offset) {
  const style = getComputedStyle(textarea);
  const mirror = document.createElement('div');
  for (const prop of ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight',
    'tabSize', 'textIndent', 'wordSpacing', 'textTransform', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft']) {
    mirror.style[prop] = style[prop];
  }
  Object.assign(mirror.style, {
    position: 'absolute',
    visibility: 'hidden',
    top: '0',
    left: '-9999px',
    boxSizing: 'border-box',
    width: `${textarea.clientWidth}px`,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
    border: '0'
  });
  mirror.textContent = textarea.value.slice(0, offset);
  const marker = document.createElement('span');
  marker.textContent = '​';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  // Includes the top padding, i.e. the scrollTop that puts this line at the very top
  const top = marker.offsetTop;
  mirror.remove();
  return top;
}

class Outline {
  /**
   * @param {object} options
   * @param {HTMLElement} options.paneEl
   * @param {HTMLElement} options.listEl
   * @param {HTMLElement} options.toggleBtn
   * @param {HTMLTextAreaElement} options.editorEl
   * @param {HTMLElement} options.previewWrapper scrolling container of the preview
   * @param {HTMLElement} options.previewEl rendered preview
   * @param {() => string} options.getMode 'editor' | 'split' | 'preview'
   * @param {() => void} [options.beforeJump] e.g. pause the editor/preview scroll sync
   */
  constructor({ paneEl, listEl, toggleBtn, editorEl, previewWrapper, previewEl, getMode, beforeJump }) {
    Object.assign(this, { paneEl, listEl, toggleBtn, editorEl, previewWrapper, previewEl, getMode, beforeJump });
    this.headings = [];
    this.activeIndex = -1;
    this.scrollFrame = null;

    this.setOpen(localStorage.getItem(STORAGE_KEY) === 'true');
    this.toggleBtn.addEventListener('click', () => this.toggle());

    // Follow the reader: preview scroll in Split/Preview, the cursor in Edit mode
    this.previewWrapper.addEventListener('scroll', () => {
      if (this.scrollFrame) return;
      this.scrollFrame = requestAnimationFrame(() => {
        this.scrollFrame = null;
        this.updateActive();
      });
    });
    for (const type of ['keyup', 'click', 'select']) {
      this.editorEl.addEventListener(type, () => { if (this.getMode() === 'editor') this.updateActive(); });
    }
  }

  isOpen() {
    return !this.paneEl.hidden;
  }

  setOpen(open) {
    this.paneEl.hidden = !open;
    this.toggleBtn.setAttribute('aria-pressed', String(open));
    this.toggleBtn.classList.toggle('active', open);
    localStorage.setItem(STORAGE_KEY, String(open));
    if (open) this.update(this.editorEl.value);
  }

  toggle() {
    this.setOpen(!this.isOpen());
  }

  /** Re-read headings from the note text (cheap; skipped while the pane is closed) */
  update(text) {
    if (!this.isOpen()) return;
    this.headings = extractHeadings(text);
    this._renderList();
    this.updateActive();
  }

  _renderList() {
    this.listEl.innerHTML = '';
    if (this.headings.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'outline-empty';
      empty.textContent = 'No headings yet — start a line with # to add one';
      this.listEl.appendChild(empty);
      return;
    }
    // Indent relative to the shallowest heading so a note without an H1 is not pushed right
    const minLevel = Math.min(...this.headings.map(h => h.level));
    this.headings.forEach((heading, index) => {
      const li = document.createElement('li');
      const link = document.createElement('a');
      link.href = '#';
      link.className = 'outline-item';
      link.dataset.level = String(heading.level);
      link.style.setProperty('--indent', heading.level - minLevel);
      link.textContent = heading.text;
      link.title = heading.text;
      link.addEventListener('click', (e) => {
        e.preventDefault();
        this.jumpTo(index);
      });
      li.appendChild(link);
      this.listEl.appendChild(li);
    });
    this.activeIndex = -1;
  }

  /**
   * Rendered heading elements lined up with this.headings: matched by text and occurrence
   * (headings in quotes or lists render too), falling back to document order
   */
  _previewHeadings() {
    const rendered = [...this.previewEl.querySelectorAll('h1, h2, h3, h4, h5, h6')];
    const used = new Set();
    return this.headings.map((heading, index) => {
      const match = rendered.find(el => !used.has(el) && el.textContent.replace(/\s+/g, ' ').trim() === heading.text)
        || rendered[index];
      if (match) used.add(match);
      return match || null;
    });
  }

  jumpTo(index) {
    const heading = this.headings[index];
    if (!heading) return;
    this.beforeJump?.();

    // Editor: put the cursor on the heading line and bring that line to the top
    const editor = this.editorEl;
    editor.focus({ preventScroll: true });
    editor.setSelectionRange(heading.offset, heading.offset);
    // A little breathing room above the heading, less than a line so nothing peeks in
    editor.scrollTop = Math.max(0, textOffsetTop(editor, heading.offset) - 6);

    // Preview: scroll the matching rendered heading to the top
    const target = this._previewHeadings()[index];
    if (target && this.getMode() !== 'editor') {
      const wrapperTop = this.previewWrapper.getBoundingClientRect().top;
      this.previewWrapper.scrollTop += target.getBoundingClientRect().top - wrapperTop - 8;
    }
    this._setActive(index);
  }

  updateActive() {
    if (!this.isOpen() || this.headings.length === 0) return;
    let active = 0;
    if (this.getMode() === 'editor') {
      const caret = this.editorEl.selectionStart;
      this.headings.forEach((h, i) => { if (h.offset <= caret) active = i; });
    } else {
      const limit = this.previewWrapper.getBoundingClientRect().top + ACTIVE_THRESHOLD;
      this._previewHeadings().forEach((el, i) => {
        if (el && el.getBoundingClientRect().top <= limit) active = i;
      });
    }
    this._setActive(active);
  }

  _setActive(index) {
    if (index === this.activeIndex) return;
    this.activeIndex = index;
    this.listEl.querySelectorAll('.outline-item').forEach((el, i) => {
      if (i === index) {
        el.setAttribute('aria-current', 'true');
        el.scrollIntoView({ block: 'nearest' });
      } else {
        el.removeAttribute('aria-current');
      }
    });
  }
}

export { Outline };
