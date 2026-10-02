/**
 * PinNote - Spelling fix at the caret (Ctrl + Space)
 * Finds the nearest misspelled word at or before the caret, highlights it and offers fixes in a
 * small list beside it: ↑ / ↓ + Enter, 1–5, or a click. Esc (or any other key) cancels.
 */

import { wordsNearCaret } from './spell-words.js';
import { replaceRange } from './smart-editor.js';

const MESSAGE_MS = 1600;
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock']);

// Styles a hidden copy of the textarea needs to lay text out exactly like the textarea does
const MIRROR_STYLES = [
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant', 'letterSpacing', 'wordSpacing',
  'lineHeight', 'textTransform', 'textIndent', 'tabSize', 'paddingTop', 'paddingRight', 'paddingBottom',
  'paddingLeft', 'whiteSpace', 'overflowWrap', 'wordBreak'
];

/** Viewport position of the text at `index` in a textarea, plus its line height */
function caretPoint(textarea, index, word) {
  const cs = getComputedStyle(textarea);
  const mirror = document.createElement('div');
  for (const prop of MIRROR_STYLES) mirror.style[prop] = cs[prop];
  Object.assign(mirror.style, {
    position: 'absolute',
    visibility: 'hidden',
    top: '0',
    left: '-9999px',
    boxSizing: 'content-box',
    border: '0',
    // clientWidth excludes the scrollbar, so lines wrap where the textarea wraps them
    width: `${textarea.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)}px`,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word'
  });
  mirror.textContent = textarea.value.slice(0, index);
  const marker = document.createElement('span');
  marker.textContent = word || '.';
  mirror.append(marker);
  document.body.append(mirror);

  const rect = textarea.getBoundingClientRect();
  const point = {
    x: rect.left + textarea.clientLeft + marker.offsetLeft - textarea.scrollLeft,
    y: rect.top + textarea.clientTop + marker.offsetTop - textarea.scrollTop,
    lineHeight: parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5
  };
  mirror.remove();
  return point;
}

function createPopup() {
  const popup = document.createElement('div');
  popup.id = 'spell-fix';
  popup.className = 'spell-fix';
  popup.hidden = true;
  // Keep focus (and the highlighted word) in the editor while the list is used with the mouse
  popup.addEventListener('mousedown', (e) => e.preventDefault());
  document.body.append(popup);
  return popup;
}

function setupSpellFix(textarea, {
  findFix = (words) => window.pinNoteAPI.spellFindFix(words),
  learnWord = (word) => window.pinNoteAPI.spellLearnWord(word)
} = {}) {
  if (!textarea) return;
  const popup = document.getElementById('spell-fix') || createPopup();
  // { mode: 'list', text, target, original, rows, selected } or { mode: 'message' }
  let state = null;
  let messageTimer = null;
  let requestId = 0;

  function close({ restore = true } = {}) {
    clearTimeout(messageTimer);
    if (state?.mode === 'list' && restore) {
      textarea.setSelectionRange(state.original.start, state.original.end);
    }
    state = null;
    popup.hidden = true;
    popup.replaceChildren();
    textarea.removeAttribute('aria-activedescendant');
    textarea.removeAttribute('aria-controls');
  }

  function place(point) {
    popup.style.left = '0px';
    popup.style.top = '0px';
    popup.hidden = false;
    const { width, height } = popup.getBoundingClientRect();
    const margin = 8;
    let top = point.y + point.lineHeight + 4;
    // Flip above the word when there is no room below it
    if (top + height > window.innerHeight - margin) top = Math.max(margin, point.y - height - 4);
    const left = Math.min(Math.max(margin, point.x - 10), window.innerWidth - width - margin);
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
  }

  function showMessage(text) {
    close();
    state = { mode: 'message' };
    const message = document.createElement('p');
    message.className = 'spell-fix-message';
    message.setAttribute('role', 'status');
    message.textContent = text;
    popup.replaceChildren(message);
    place(caretPoint(textarea, textarea.selectionEnd, ''));
    messageTimer = setTimeout(() => close(), MESSAGE_MS);
  }

  function renderList(target, suggestions) {
    const head = document.createElement('div');
    head.className = 'spell-fix-head';
    const typo = document.createElement('span');
    typo.className = 'spell-fix-typo';
    typo.textContent = target.word;
    head.append(typo);

    const list = document.createElement('ul');
    list.id = 'spell-fix-list';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', `Spelling fixes for ${target.word}`);

    const rows = suggestions.map((word, i) => ({ id: `spell-fix-opt-${i}`, word, key: String(i + 1) }));
    rows.push({ id: 'spell-fix-learn', action: 'learn' });

    if (!suggestions.length) {
      const none = document.createElement('li');
      none.className = 'spell-fix-none';
      none.textContent = 'No suggestions';
      list.append(none);
    }
    rows.forEach((row, i) => {
      const item = document.createElement('li');
      item.id = row.id;
      item.setAttribute('role', 'option');
      item.className = row.action ? 'spell-fix-option spell-fix-learn' : 'spell-fix-option';
      if (row.action) {
        item.dataset.action = row.action;
        item.textContent = 'Add to dictionary';
      } else {
        item.dataset.word = row.word;
        const key = document.createElement('kbd');
        key.textContent = row.key;
        const label = document.createElement('span');
        label.textContent = row.word;
        item.append(key, label);
      }
      item.addEventListener('mouseenter', () => select(i));
      item.addEventListener('click', () => choose(i));
      list.append(item);
    });

    popup.replaceChildren(head, list);
    textarea.setAttribute('aria-controls', list.id);
    return rows;
  }

  function select(index) {
    if (state?.mode !== 'list') return;
    state.selected = index < 0 ? -1 : index % state.rows.length;
    popup.querySelectorAll('[role="option"]').forEach((el, i) => {
      el.setAttribute('aria-selected', String(i === state.selected));
    });
    if (state.selected < 0) textarea.removeAttribute('aria-activedescendant');
    else textarea.setAttribute('aria-activedescendant', state.rows[state.selected].id);
  }

  function step(delta) {
    const count = state.rows.length;
    // From "nothing selected", Down goes to the first row and Up to the last
    const from = state.selected < 0 ? (delta > 0 ? -1 : count) : state.selected;
    select((from + delta + count) % count);
  }

  async function choose(index) {
    if (state?.mode !== 'list') return;
    const { text, target, original, rows } = state;
    const row = rows[index];
    // Nothing chosen, or the note changed underneath the list (e.g. synced from a sticky window)
    if (!row || textarea.value !== text) {
      close({ restore: textarea.value === text });
      return;
    }
    if (row.action === 'learn') {
      close();
      try {
        await learnWord(target.word);
      } catch (err) {
        console.error('Could not add the word to the dictionary:', err);
      }
      return;
    }

    close({ restore: false });
    replaceRange(textarea, row.word, target.start, target.end);
    // Put the caret back where the writer was, shifted by the change in length
    const caret = original.end >= target.end
      ? original.end + row.word.length - (target.end - target.start)
      : target.start + row.word.length;
    textarea.setSelectionRange(caret, caret);
  }

  async function open() {
    const id = ++requestId;
    close();
    const text = textarea.value;
    const original = { start: textarea.selectionStart, end: textarea.selectionEnd };
    const words = wordsNearCaret(text, original.end);

    let fix = null;
    if (words.length) {
      try {
        fix = await findFix(words.map(w => w.word));
      } catch (err) {
        console.error('Spelling lookup failed:', err);
        return;
      }
    }
    // The writer kept typing, moved the caret or pressed Ctrl + Space again while we looked the words up
    const moved = textarea.selectionStart !== original.start || textarea.selectionEnd !== original.end;
    if (id !== requestId || textarea.value !== text || moved || document.activeElement !== textarea) return;

    if (!fix) {
      showMessage('No spelling mistakes near the cursor');
      return;
    }
    const target = words[fix.index];
    textarea.setSelectionRange(target.start, target.end);
    state = { mode: 'list', text, target, original, rows: [], selected: -1 };
    state.rows = renderList(target, fix.suggestions);
    // With no fixes, leave "Add to dictionary" unselected so a reflex Enter cannot learn a typo
    select(fix.suggestions.length ? 0 : -1);
    place(caretPoint(textarea, target.start, target.word));
  }

  // Capture phase, so list keys (Enter, Tab, arrows) never reach the smart editor's handlers
  textarea.addEventListener('keydown', (e) => {
    // An IME (e.g. Vietnamese Telex) is composing: put the caret back so it does not type over the word
    if (e.isComposing || e.keyCode === 229) {
      if (state) close();
      return;
    }

    if (e.ctrlKey && !e.altKey && !e.shiftKey && e.code === 'Space') {
      e.preventDefault();
      e.stopImmediatePropagation();
      // Holding the keys down must not queue up lookups
      if (!e.repeat) open();
      return;
    }
    if (!state || MODIFIER_KEYS.has(e.key)) return;

    const handled = () => {
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    if (e.key === 'Escape') {
      handled();
      close();
      return;
    }
    if (state.mode === 'list' && !e.ctrlKey && !e.altKey) {
      const digit = Number(e.key);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        handled();
        step(e.key === 'ArrowDown' ? 1 : -1);
        return;
      }
      if (e.key === 'Enter') {
        handled();
        choose(state.selected);
        return;
      }
      if (Number.isInteger(digit) && digit >= 1 && digit < state.rows.length) {
        handled();
        choose(digit - 1);
        return;
      }
    }
    // Any other key cancels and then does what it normally does at the caret
    close();
  }, true);

  textarea.addEventListener('blur', () => close());
  // A click moves the caret, and typing changes the text: either way the list no longer applies
  textarea.addEventListener('mousedown', () => close({ restore: false }));
  textarea.addEventListener('input', () => close({ restore: false }));
  // Selecting the word can scroll the editor; keep the list beside it rather than closing
  textarea.addEventListener('scroll', () => {
    if (state?.mode === 'list') place(caretPoint(textarea, state.target.start, state.target.word));
    else close();
  });
  window.addEventListener('resize', () => close());
}

export { setupSpellFix };
