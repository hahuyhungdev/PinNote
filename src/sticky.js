/**
 * PinNote - Floating Desktop Sticky Note Controller
 * Individual Note Window with dedicated Always-On-Top screen pinning and live sync
 */

import { renderMarkdown, enhancePreview, noteTitle } from './modules/preview.js';
import { setupSmartEditor } from './modules/smart-editor.js';

const urlParams = new URLSearchParams(window.location.search);
let currentFilePath = urlParams.get('filePath');

const $ = (id) => document.getElementById(id);
const dom = {
  filename: $('sticky-filename'),
  pin: $('sticky-pin'),
  opacity: $('sticky-opacity'),
  min: $('sticky-min'),
  close: $('sticky-close'),
  modeEdit: $('mode-edit'),
  modeSplit: $('mode-split'),
  modePrev: $('mode-prev'),
  stickyZoomOut: $('sticky-zoom-out'),
  stickyZoomIn: $('sticky-zoom-in'),
  wordCount: $('sticky-word-count'),
  status: $('sticky-status'),
  body: $('sticky-body'),
  input: $('sticky-input'),
  preview: $('sticky-preview')
};

let saveTimeout = null;
let isDirty = false;
let viewMode = 'edit';
let currentFontSize = parseInt(localStorage.getItem('pinnote_sticky_font_size') || '18', 10);

// Share the main window's interface scale
const uiScale = parseFloat(localStorage.getItem('pinnote_ui_scale'));
if (Number.isFinite(uiScale)) document.documentElement.style.setProperty('--ui-scale', String(uiScale));

function setStatus(text, kind) {
  dom.status.textContent = text;
  dom.status.className = `save-status ${kind}`;
}

function updateStats() {
  const text = dom.input.value;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  dom.wordCount.textContent = `${words} words`;
}

function updatePreview() {
  updateStats();
  if (viewMode === 'edit') return;
  dom.preview.innerHTML = renderMarkdown(dom.input.value);
  enhancePreview(dom.preview, {
    getSource: () => dom.input.value,
    onSourceChange: (next) => {
      dom.input.value = next;
      queueSave();
      updatePreview();
    }
  });
}

function setFontSize(size) {
  currentFontSize = Math.max(10, Math.min(40, size));
  document.documentElement.style.setProperty('--editor-font-size', `${currentFontSize}px`);
  localStorage.setItem('pinnote_sticky_font_size', currentFontSize);
}

function setViewMode(mode) {
  viewMode = mode;
  const buttons = { edit: dom.modeEdit, split: dom.modeSplit, prev: dom.modePrev };
  Object.entries(buttons).forEach(([key, btn]) => {
    btn.classList.toggle('active', key === mode);
    btn.setAttribute('aria-pressed', String(key === mode));
  });

  dom.body.className = `sticky-body sticky-mode-${mode}`;
  updatePreview();
}

async function saveNow() {
  clearTimeout(saveTimeout);
  if (!currentFilePath) return;
  const content = dom.input.value;
  try {
    await window.pinNoteAPI.saveFileContent(currentFilePath, content);
    if (dom.input.value === content) {
      isDirty = false;
      setStatus('Saved', 'saved');
    }
  } catch (err) {
    console.error('Sticky save failed:', err);
    setStatus('Save failed', 'error');
  }
}

function queueSave() {
  isDirty = true;
  setStatus('Unsaved', 'saving');
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(saveNow, 400);
}

function updateTitle(p) {
  const name = noteTitle(p.split(/[/\\]/).pop());
  dom.filename.textContent = name;
  dom.filename.title = p;
  document.title = `${name} — PinNote sticky`;
}

function bindWindowControls() {
  dom.min.addEventListener('click', () => window.pinNoteAPI.minimizeWindow());
  dom.close.addEventListener('click', () => window.pinNoteAPI.closeWindow());

  window.pinNoteAPI.onBeforeClose(async () => {
    if (isDirty) await saveNow();
    window.pinNoteAPI.readyToClose();
  });
}

async function initSticky() {
  // Bound first: this frameless always-on-top window must stay closable even if loading fails
  bindWindowControls();
  if (!currentFilePath) return;
  updateTitle(currentFilePath);
  setFontSize(currentFontSize);

  try {
    dom.input.value = (await window.pinNoteAPI.readFileContent(currentFilePath)) || '';
  } catch (err) {
    setStatus('Could not open note', 'error');
    dom.input.readOnly = true;
    return;
  }
  setViewMode('edit');

  // Individual Note Always-On-Top Pin Toggle
  dom.pin.addEventListener('click', async () => {
    const pinned = await window.pinNoteAPI.toggleAlwaysOnTop();
    dom.pin.classList.toggle('pinned', pinned);
    dom.pin.setAttribute('aria-pressed', String(pinned));
    dom.pin.title = pinned ? 'Pinned on top — click to unpin' : 'Not pinned — click to keep on top';
  });

  dom.opacity.addEventListener('input', (e) => {
    window.pinNoteAPI.setWindowOpacity(parseFloat(e.target.value));
  });

  dom.modeEdit.addEventListener('click', () => setViewMode('edit'));
  dom.modeSplit.addEventListener('click', () => setViewMode('split'));
  dom.modePrev.addEventListener('click', () => setViewMode('prev'));

  dom.stickyZoomIn.addEventListener('click', () => setFontSize(currentFontSize + 2));
  dom.stickyZoomOut.addEventListener('click', () => setFontSize(currentFontSize - 2));

  setupSmartEditor(dom.input, { onSave: saveNow });

  // Typing (and smart-editor edits) auto-save
  dom.input.addEventListener('input', () => {
    queueSave();
    if (viewMode === 'split') updatePreview();
    else updateStats();
  });

  // Cross-window live sync
  window.pinNoteAPI.onFileSavedExternally((savedPath, newContent) => {
    if (savedPath !== currentFilePath || isDirty || dom.input.value === newContent) return;
    const { selectionStart, selectionEnd, scrollTop } = dom.input;
    dom.input.value = newContent;
    dom.input.setSelectionRange(Math.min(selectionStart, newContent.length), Math.min(selectionEnd, newContent.length));
    dom.input.scrollTop = scrollTop;
    updatePreview();
    setStatus('Synced', 'saved');
  });

  window.pinNoteAPI.onFileRenamedExternally((oldPath, newPath) => {
    if (oldPath === currentFilePath) {
      currentFilePath = newPath;
      updateTitle(newPath);
    }
  });

  window.pinNoteAPI.onFileDeletedExternally((deletedPath) => {
    if (deletedPath === currentFilePath) {
      // Forget the path first so the close flush cannot re-create the deleted file
      clearTimeout(saveTimeout);
      currentFilePath = null;
      isDirty = false;
      window.pinNoteAPI.closeWindow();
    }
  });
}

window.addEventListener('DOMContentLoaded', initSticky);
