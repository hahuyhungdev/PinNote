/**
 * PinNote - Application Orchestrator
 * High-leverage coordinator binding Vault Management, Smart Editor, Note History, and Floating Sticky Notes
 */

import { renderMarkdown, extractTags, enhancePreview, flattenNoteFiles, noteTitle, findNoteByTitle } from './modules/preview.js';
import { setupSmartEditor, insertFormat } from './modules/smart-editor.js';
import { recordNoteSnapshot } from './modules/history.js';
import { HistoryModal } from './modules/history-modal.js';
import { NoteManager, getDefaultNoteName } from './modules/note-manager.js';
import { QuickSwitcher } from './modules/quick-switcher.js';
import { UIControls } from './modules/ui-controls.js';

// Application State
const state = {
  currentVaultPath: null,
  activeNotePath: null,
  notesTree: [],
  isDirty: false,
  saveTimeout: null,
  renderFrame: null,
  tagSearchToken: 0
};

const $ = (id) => document.getElementById(id);

// DOM References
const dom = {
  // Window & Header
  winMin: $('win-min'),
  winMax: $('win-max'),
  winClose: $('win-close'),
  opacitySlider: $('opacity-slider'),
  opacityValue: $('opacity-value'),

  // Modes & Workspace
  btnModeEditor: $('btn-mode-editor'),
  btnModeSplit: $('btn-mode-split'),
  btnModePreview: $('btn-mode-preview'),
  workspaceContainer: $('workspace-container'),
  editorWrapper: $('editor-wrapper'),
  previewWrapper: $('preview-wrapper'),

  // Sidebar & Vault
  btnToggleSidebar: $('btn-toggle-sidebar'),
  sidebar: $('sidebar'),
  vaultNameDisplay: $('vault-name-display'),
  currentVaultPath: $('current-vault-path'),
  btnRefreshVault: $('btn-refresh-vault'),
  btnChangeVault: $('btn-change-vault'),
  btnNewNote: $('btn-new-note'),
  noteSearchInput: $('note-search-input'),
  btnClearSearch: $('btn-clear-search'),
  noteTree: $('note-tree'),
  tagCloud: $('tag-cloud'),

  // Note Info & Status
  activeNoteBadge: $('active-note-badge'),
  saveStatusIndicator: $('save-status-indicator'),
  btnNoteHistory: $('btn-note-history'),
  btnPopoutNote: $('btn-popout-note'),
  btnZoomOut: $('btn-zoom-out'),
  btnZoomIn: $('btn-zoom-in'),
  zoomLevelText: $('zoom-level-text'),
  btnUiSmaller: $('btn-ui-smaller'),
  btnUiLarger: $('btn-ui-larger'),
  uiScaleText: $('ui-scale-text'),

  // Editor & Preview
  markdownInput: $('markdown-input'),
  markdownPreview: $('markdown-preview'),

  // Statusbar
  wordCount: $('word-count'),
  charCount: $('char-count'),
  lineCount: $('line-count'),

  // Modals
  btnQuickSwitcher: $('btn-quick-switcher'),
  quickModal: $('quick-modal'),
  quickInput: $('quick-input'),
  quickResults: $('quick-results'),

  historyModal: $('history-modal')
};

// Module Instances
let noteManager;
let historyModal;
let quickSwitcher;
let uiControls;

const allFiles = () => flattenNoteFiles(state.notesTree);
const fileName = (p) => p.split(/[/\\]/).pop();

// ==========================================
// INITIALIZATION
// ==========================================

async function initApp() {
  noteManager = new NoteManager();

  uiControls = new UIControls({
    dom,
    onModeChange: () => schedulePreviewUpdate()
  });

  historyModal = new HistoryModal({
    modalEl: dom.historyModal,
    onRestoreNote: (filePath, restoredContent) => {
      if (state.activeNotePath === filePath) {
        clearTimeout(state.saveTimeout);
        dom.markdownInput.value = restoredContent;
        state.isDirty = false;
        schedulePreviewUpdate();
        updateStats();
        setSaveStatus('Restored', 'saved');
      }
    }
  });

  quickSwitcher = new QuickSwitcher({
    modalEl: dom.quickModal,
    inputEl: dom.quickInput,
    resultsEl: dom.quickResults,
    onSelectNote: (filePath) => openNote(filePath)
  });

  setupEventListeners();
  setupSmartEditor(dom.markdownInput, { onSave: () => saveCurrentNote(true) });
  setupCrossWindowSync();

  // Load Vault & Notes
  try {
    // Main owns the vault path; the old localStorage value is only offered once for migration
    state.currentVaultPath = await window.pinNoteAPI.getCurrentVault(localStorage.getItem('pinnote_vault_path'));
    localStorage.removeItem('pinnote_vault_path');
    await refreshVault();

    const files = allFiles();
    const savedLastNote = localStorage.getItem('pinnote_last_note');
    if (savedLastNote && files.some(item => item.path === savedLastNote)) {
      openNote(savedLastNote);
    } else if (files.length > 0) {
      openNote(files[0].path);
    } else {
      createNewNote();
    }
  } catch (err) {
    console.error('Initialization error:', err);
  }
}

// ==========================================
// VAULT & NOTE OPERATIONS
// ==========================================

async function refreshVault() {
  const result = await window.pinNoteAPI.readVaultTree(state.currentVaultPath);
  state.currentVaultPath = result.vaultPath;
  state.notesTree = result.items || [];

  const folderName = state.currentVaultPath.split(/[/\\]/).filter(Boolean).pop() || 'PinNote Vault';
  dom.vaultNameDisplay.textContent = folderName;
  dom.vaultNameDisplay.title = state.currentVaultPath;
  dom.currentVaultPath.textContent = state.currentVaultPath;
  dom.currentVaultPath.title = state.currentVaultPath;

  await renderTreeUI();
  updateTagsCloud();
}

async function renderTreeUI() {
  const query = dom.noteSearchInput.value.trim();
  let tagMatches = null;

  if (query.startsWith('#') && query.length > 1) {
    const token = ++state.tagSearchToken;
    const paths = await window.pinNoteAPI.findNotesWithTag(state.currentVaultPath, query);
    if (token !== state.tagSearchToken) return; // a newer search superseded this one
    tagMatches = new Set(paths);
  } else {
    state.tagSearchToken++;
  }

  noteManager.renderTree(
    state.notesTree,
    dom.noteTree,
    query,
    state.activeNotePath,
    {
      onOpen: (path) => openNote(path),
      onDelete: (path, name) => deleteNote(path, name),
      onPinToggle: () => renderTreeUI(),
      onRename: (oldPath, newPath) => handleRenamed(oldPath, newPath)
    },
    tagMatches
  );
}

function handleRenamed(oldPath, newPath) {
  if (state.activeNotePath === oldPath) {
    state.activeNotePath = newPath;
    localStorage.setItem('pinnote_last_note', newPath);
    dom.activeNoteBadge.textContent = fileName(newPath);
  }
  refreshVault();
}

function setActiveNoteUI(filePath) {
  dom.activeNoteBadge.textContent = filePath ? fileName(filePath) : 'No note open';
  dom.activeNoteBadge.title = filePath ? `${filePath}\nClick to rename` : '';
  document.title = filePath ? `${noteTitle(fileName(filePath))} — PinNote` : 'PinNote';
}

async function openNote(filePath) {
  if (state.activeNotePath && state.activeNotePath !== filePath && state.isDirty) {
    await saveCurrentNote(true);
  }

  try {
    const content = await noteManager.readNote(filePath);
    clearTimeout(state.saveTimeout);
    state.activeNotePath = filePath;
    state.isDirty = false;
    localStorage.setItem('pinnote_last_note', filePath);

    dom.markdownInput.value = content || '';
    dom.markdownInput.scrollTop = 0;
    setActiveNoteUI(filePath);
    setSaveStatus('Saved', 'saved');

    updatePreviewNow();
    updateStats();
    renderTreeUI();

    // Checkpoint in history on opening note if first time
    recordNoteSnapshot(filePath, content || '', false);
  } catch (err) {
    console.error('Failed to open note:', err);
    setSaveStatus('Could not open note', 'error');
  }
}

function setSaveStatus(text, kind) {
  dom.saveStatusIndicator.textContent = text;
  dom.saveStatusIndicator.className = `save-status ${kind}`;
}

async function saveCurrentNote(forceSnapshot = false) {
  clearTimeout(state.saveTimeout);
  if (!state.activeNotePath) return;

  const filePath = state.activeNotePath;
  const content = dom.markdownInput.value;
  setSaveStatus('Saving…', 'saving');

  try {
    await noteManager.saveNote(filePath, content);
    // Only clear the dirty flag if nothing changed while the write was in flight
    if (state.activeNotePath === filePath && dom.markdownInput.value === content) {
      state.isDirty = false;
      setSaveStatus('Saved', 'saved');
    }
    recordNoteSnapshot(filePath, content, forceSnapshot);
  } catch (err) {
    console.error('Save error:', err);
    setSaveStatus('Save failed', 'error');
  }
}

function queueAutoSave() {
  state.isDirty = true;
  setSaveStatus('Unsaved', 'saving');

  clearTimeout(state.saveTimeout);
  state.saveTimeout = setTimeout(() => saveCurrentNote(false), 500);
}

async function createNewNote(customTitle = null) {
  try {
    const created = await noteManager.createNote(state.currentVaultPath, customTitle || getDefaultNoteName());
    await refreshVault();
    openNote(created.filePath);
  } catch (err) {
    console.error('Create note failed:', err);
    alert(`Could not create note: ${err.message}`);
  }
}

function clearEditor() {
  clearTimeout(state.saveTimeout);
  state.activeNotePath = null;
  state.isDirty = false;
  dom.markdownInput.value = '';
  dom.markdownPreview.innerHTML = '';
  setActiveNoteUI(null);
  updateStats();
}

async function deleteNote(filePath, name) {
  if (!confirm(`Delete "${name}"?\n\nThis also removes its revision history.`)) return;

  const wasActive = state.activeNotePath === filePath;
  if (wasActive) clearTimeout(state.saveTimeout);
  try {
    await noteManager.deleteNote(filePath);
    if (wasActive) clearEditor();
  } catch (err) {
    alert(`Could not delete note: ${err.message}`);
    if (wasActive && state.isDirty) queueAutoSave();
    return;
  }
  await refreshVault();

  // Only move to another note when the one being edited was deleted
  if (wasActive) {
    const next = allFiles()[0];
    if (next) openNote(next.path);
  }
}

// ==========================================
// PREVIEW & TAGS
// ==========================================

function schedulePreviewUpdate() {
  if (state.renderFrame) cancelAnimationFrame(state.renderFrame);
  state.renderFrame = requestAnimationFrame(() => {
    state.renderFrame = null;
    updatePreviewNow();
  });
}

function updatePreviewNow() {
  updateTagsCloud();
  // Editor-only mode never shows the preview; skip the render work while typing
  if (uiControls.currentViewMode === 'editor') return;

  dom.markdownPreview.innerHTML = renderMarkdown(dom.markdownInput.value);
  enhancePreview(dom.markdownPreview, {
    getSource: () => dom.markdownInput.value,
    onSourceChange: (next) => {
      dom.markdownInput.value = next;
      queueAutoSave();
      updateStats();
      schedulePreviewUpdate();
    },
    onWikiLink: (targetTitle) => {
      const target = findNoteByTitle(allFiles(), targetTitle);
      if (target) openNote(target.path);
      else createNewNote(targetTitle);
    }
  });
}

function updateTagsCloud() {
  const tags = extractTags(dom.markdownInput.value);
  dom.tagCloud.innerHTML = '';

  if (tags.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'tag-empty';
    empty.textContent = 'No tags in this note';
    dom.tagCloud.appendChild(empty);
    return;
  }

  tags.forEach(tag => {
    const tagEl = document.createElement('button');
    tagEl.type = 'button';
    tagEl.className = 'tag-pill';
    tagEl.textContent = tag;
    tagEl.title = `Show notes tagged ${tag}`;
    tagEl.addEventListener('click', () => setSearch(tag));
    dom.tagCloud.appendChild(tagEl);
  });
}

let searchTimer = null;
function setSearch(value, { debounce = false } = {}) {
  dom.noteSearchInput.value = value;
  dom.btnClearSearch.hidden = value.length === 0;
  clearTimeout(searchTimer);
  // #tag searches read every note in main; wait for typing to pause
  if (debounce && value.trim().startsWith('#')) searchTimer = setTimeout(renderTreeUI, 250);
  else renderTreeUI();
}

function updateStats() {
  const text = dom.markdownInput.value;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  dom.wordCount.textContent = `${words} words`;
  dom.charCount.textContent = `${text.length} chars`;
  dom.lineCount.textContent = `${text.split('\n').length} lines`;
}

// ==========================================
// MULTI-WINDOW SYNC & SAFE CLOSE
// ==========================================

function setupCrossWindowSync() {
  window.pinNoteAPI.onFileSavedExternally((filePath, content) => {
    if (state.activeNotePath !== filePath || state.isDirty || dom.markdownInput.value === content) return;
    const { selectionStart, selectionEnd, scrollTop } = dom.markdownInput;
    dom.markdownInput.value = content;
    dom.markdownInput.setSelectionRange(Math.min(selectionStart, content.length), Math.min(selectionEnd, content.length));
    dom.markdownInput.scrollTop = scrollTop;
    updatePreviewNow();
    updateStats();
  });

  window.pinNoteAPI.onFileRenamedExternally((oldPath, newPath) => {
    if (state.activeNotePath === oldPath) {
      state.activeNotePath = newPath;
      localStorage.setItem('pinnote_last_note', newPath);
      setActiveNoteUI(newPath);
    }
  });

  window.pinNoteAPI.onFileDeletedExternally((filePath) => {
    if (state.activeNotePath === filePath) clearEditor();
  });

  window.pinNoteAPI.onVaultTreeChanged(() => refreshVault());

  // Flush pending edits before the window closes (close button, Alt+F4, taskbar)
  window.pinNoteAPI.onBeforeClose(async () => {
    if (state.isDirty) await saveCurrentNote(true);
    window.pinNoteAPI.readyToClose();
  });
}

// ==========================================
// EVENT LISTENERS & SHORTCUTS
// ==========================================

function setupBadgeRename() {
  dom.activeNoteBadge.addEventListener('click', () => {
    if (!state.activeNotePath) return;
    // Edit the bare title; the badge shows the full file name again afterwards
    dom.activeNoteBadge.textContent = noteTitle(fileName(state.activeNotePath));
    noteManager.inlineRename(state.activeNotePath, dom.activeNoteBadge, handleRenamed, {
      inputClass: 'inline-rename-badge-input',
      onDone: () => setActiveNoteUI(state.activeNotePath)
    });
  });

  dom.activeNoteBadge.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === 'F2') dom.activeNoteBadge.click();
  });
}

function popOutActiveNote() {
  if (state.activeNotePath) window.pinNoteAPI.openDetachedNoteWindow(state.activeNotePath);
}

async function openHistory() {
  if (!state.activeNotePath) return;
  if (state.isDirty) await saveCurrentNote(true);
  historyModal.open(state.activeNotePath, dom.markdownInput.value);
}

function setupEventListeners() {
  // Vault Folder Picker
  dom.btnChangeVault.addEventListener('click', async () => {
    const chosen = await window.pinNoteAPI.selectVaultFolder();
    if (!chosen) return;
    if (state.isDirty) await saveCurrentNote(true);
    state.currentVaultPath = chosen;
    clearEditor();
    await refreshVault();
    const first = allFiles()[0];
    if (first) openNote(first.path);
  });

  dom.btnRefreshVault.addEventListener('click', () => refreshVault());
  dom.btnNewNote.addEventListener('click', () => createNewNote());

  // Search Filter in Sidebar
  dom.noteSearchInput.addEventListener('input', (e) => setSearch(e.target.value, { debounce: true }));
  dom.noteSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dom.noteSearchInput.value) {
      e.preventDefault();
      setSearch('');
    }
  });
  dom.btnClearSearch.addEventListener('click', () => {
    setSearch('');
    dom.noteSearchInput.focus();
  });

  dom.btnPopoutNote.addEventListener('click', popOutActiveNote);
  dom.btnNoteHistory.addEventListener('click', openHistory);
  dom.btnToggleSidebar.addEventListener('click', toggleSidebar);
  setupBadgeRename();

  // Editor Input Typing (smart-editor edits also arrive here as 'input' events)
  dom.markdownInput.addEventListener('input', () => {
    queueAutoSave();
    schedulePreviewUpdate();
    updateStats();
  });

  // Formatting Toolbar Buttons
  document.querySelectorAll('.fmt-btn[data-fmt]').forEach(btn => {
    btn.addEventListener('click', () => insertFormat(dom.markdownInput, btn.getAttribute('data-fmt')));
  });

  dom.btnQuickSwitcher.addEventListener('click', () => quickSwitcher.open(state.notesTree));

  window.addEventListener('keydown', handleGlobalShortcut);
}

function toggleSidebar() {
  const collapsed = dom.sidebar.classList.toggle('collapsed');
  dom.btnToggleSidebar.setAttribute('aria-pressed', String(!collapsed));
}

function handleGlobalShortcut(e) {
  // The smart editor already handled this key (e.g. Ctrl+S inside the textarea)
  if (e.defaultPrevented || !e.ctrlKey || e.altKey) return;
  const key = e.key.toLowerCase();

  // Ctrl + Shift + = / - / 0 -> Interface scale
  if (e.shiftKey) {
    if (e.code === 'Equal' || e.code === 'NumpadAdd') { e.preventDefault(); uiControls.stepUiScale(1); }
    else if (e.code === 'Minus' || e.code === 'NumpadSubtract') { e.preventDefault(); uiControls.stepUiScale(-1); }
    else if (e.code === 'Digit0' || e.code === 'Numpad0') { e.preventDefault(); uiControls.resetUiScale(); }
    return;
  }

  const actions = {
    p: popOutActiveNote,
    k: () => quickSwitcher.open(state.notesTree),
    h: openHistory,
    n: () => createNewNote(),
    s: () => saveCurrentNote(true),
    '\\': toggleSidebar
  };

  if (actions[key]) {
    e.preventDefault();
    actions[key]();
  } else if (e.code === 'Equal' || e.code === 'NumpadAdd') {
    e.preventDefault();
    uiControls.zoomEditor(1);
  } else if (e.code === 'Minus' || e.code === 'NumpadSubtract') {
    e.preventDefault();
    uiControls.zoomEditor(-1);
  } else if (e.code === 'Digit0' || e.code === 'Numpad0') {
    e.preventDefault();
    uiControls.resetEditorZoom();
  }
}

// Run App
window.addEventListener('DOMContentLoaded', initApp);
