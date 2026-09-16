/**
 * PinNote - Application Orchestrator
 * High-leverage coordinator binding Vault Management, Smart Editor, Note History, and Floating Sticky Notes
 */

const { renderMarkdown, toggleTaskCheckbox, extractTags, attachCodeCopyButtons } = require('./modules/markdown');
const { setupSmartEditor, insertFormat } = require('./modules/smart-editor');
const { recordNoteSnapshot } = require('./modules/history');
const { HistoryModal } = require('./modules/history-modal');
const { NoteManager, getDefaultNoteName } = require('./modules/note-manager');
const { QuickSwitcher } = require('./modules/quick-switcher');
const { UIControls } = require('./modules/ui-controls');

// Application State
const state = {
  currentVaultPath: null,
  activeNotePath: null,
  notesTree: [],
  isDirty: false,
  saveTimeout: null,
  renderFrame: null
};

// DOM References
const dom = {
  // Window & Header
  winMin: document.getElementById('win-min'),
  winMax: document.getElementById('win-max'),
  winClose: document.getElementById('win-close'),
  opacitySlider: document.getElementById('opacity-slider'),
  opacityValue: document.getElementById('opacity-value'),

  // Modes & Workspace
  btnModeEditor: document.getElementById('btn-mode-editor'),
  btnModeSplit: document.getElementById('btn-mode-split'),
  btnModePreview: document.getElementById('btn-mode-preview'),
  workspaceContainer: document.getElementById('workspace-container'),
  editorWrapper: document.getElementById('editor-wrapper'),
  previewWrapper: document.getElementById('preview-wrapper'),

  // Sidebar & Vault
  btnToggleSidebar: document.getElementById('btn-toggle-sidebar'),
  sidebar: document.getElementById('sidebar'),
  vaultNameDisplay: document.getElementById('vault-name-display'),
  currentVaultPath: document.getElementById('current-vault-path'),
  btnRefreshVault: document.getElementById('btn-refresh-vault'),
  btnChangeVault: document.getElementById('btn-change-vault'),
  btnNewNote: document.getElementById('btn-new-note'),
  noteSearchInput: document.getElementById('note-search-input'),
  btnClearSearch: document.getElementById('btn-clear-search'),
  noteTree: document.getElementById('note-tree'),
  tagCloud: document.getElementById('tag-cloud'),

  // Note Info & Status
  activeNoteBadge: document.getElementById('active-note-badge'),
  saveStatusIndicator: document.getElementById('save-status-indicator'),
  btnNoteHistory: document.getElementById('btn-note-history'),
  btnPopoutNote: document.getElementById('btn-popout-note'),
  btnZoomOut: document.getElementById('btn-zoom-out'),
  btnZoomIn: document.getElementById('btn-zoom-in'),
  zoomLevelText: document.getElementById('zoom-level-text'),

  // Editor & Preview
  markdownInput: document.getElementById('markdown-input'),
  markdownPreview: document.getElementById('markdown-preview'),

  // Statusbar
  wordCount: document.getElementById('word-count'),
  charCount: document.getElementById('char-count'),
  lineCount: document.getElementById('line-count'),

  // Modals
  btnQuickSwitcher: document.getElementById('btn-quick-switcher'),
  quickModal: document.getElementById('quick-modal'),
  quickInput: document.getElementById('quick-input'),
  quickResults: document.getElementById('quick-results'),

  historyModal: document.getElementById('history-modal')
};

// Module Instances
let noteManager;
let historyModal;
let quickSwitcher;
let uiControls;

// ==========================================
// INITIALIZATION
// ==========================================

async function initApp() {
  document.documentElement.setAttribute('data-theme', 'warm-white');

  noteManager = new NoteManager();

  uiControls = new UIControls({
    dom,
    onModeChange: () => schedulePreviewUpdate(),
    onFontSizeChange: () => {}
  });

  historyModal = new HistoryModal({
    modalEl: dom.historyModal,
    onRestoreNote: (filePath, restoredContent) => {
      if (state.activeNotePath === filePath) {
        dom.markdownInput.value = restoredContent;
        state.isDirty = false;
        schedulePreviewUpdate();
        updateStats();
        dom.saveStatusIndicator.textContent = 'Restored';
        dom.saveStatusIndicator.className = 'save-status saved';
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
  setupSmartKeyboard();
  setupCrossWindowSync();

  // Load Vault & Notes
  try {
    const savedVault = localStorage.getItem('pinnote_vault_path');
    const defaultPath = await window.pinNoteAPI.getDefaultVaultDir();
    state.currentVaultPath = savedVault || defaultPath;

    await refreshVault();

    const savedLastNote = localStorage.getItem('pinnote_last_note');
    if (savedLastNote && state.notesTree.some(item => item.path === savedLastNote)) {
      openNote(savedLastNote);
    } else if (state.notesTree.length > 0) {
      const firstFile = state.notesTree.find(item => item.type === 'file');
      if (firstFile) openNote(firstFile.path);
      else createNewNote();
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
  const defaultVault = await window.pinNoteAPI.getDefaultVaultDir();
  if (!state.currentVaultPath) state.currentVaultPath = defaultVault;

  const result = await window.pinNoteAPI.readVaultTree(state.currentVaultPath);
  state.currentVaultPath = result.vaultPath || defaultVault;
  state.notesTree = result.items || [];

  const folderName = state.currentVaultPath.split(/[/\\]/).filter(Boolean).pop() || 'PinNote Vault';
  if (dom.vaultNameDisplay) dom.vaultNameDisplay.textContent = folderName;
  if (dom.currentVaultPath) dom.currentVaultPath.textContent = state.currentVaultPath;

  renderTreeUI();
  updateTagsCloud();
}

function renderTreeUI() {
  noteManager.renderTree(
    state.notesTree,
    dom.noteTree,
    dom.noteSearchInput.value,
    state.activeNotePath,
    {
      onOpen: (path) => openNote(path),
      onDelete: (path, name) => deleteNote(path, name),
      onPinToggle: () => renderTreeUI(),
      onRename: (oldPath, newPath, newName) => {
        if (state.activeNotePath === oldPath) {
          state.activeNotePath = newPath;
          localStorage.setItem('pinnote_last_note', newPath);
          dom.activeNoteBadge.textContent = `${newName}.md`;
        }
        refreshVault();
      }
    }
  );
}

async function openNote(filePath) {
  if (state.isDirty && state.activeNotePath && state.activeNotePath !== filePath) {
    await saveCurrentNote(true);
  }

  try {
    const content = await noteManager.readNote(filePath);
    state.activeNotePath = filePath;
    state.isDirty = false;
    localStorage.setItem('pinnote_last_note', filePath);

    dom.markdownInput.value = content || '';
    dom.activeNoteBadge.textContent = filePath.split(/[/\\]/).pop();

    updatePreviewNow();
    updateStats();
    renderTreeUI();

    // Checkpoint in history on opening note if first time
    recordNoteSnapshot(filePath, content || '', false);
  } catch (err) {
    console.error('Failed to open note:', err);
  }
}

async function saveCurrentNote(forceSnapshot = false) {
  if (!state.activeNotePath) return;

  dom.saveStatusIndicator.textContent = 'Saving...';
  dom.saveStatusIndicator.className = 'save-status saving';

  try {
    const content = dom.markdownInput.value;
    await noteManager.saveNote(state.activeNotePath, content);
    state.isDirty = false;

    // Record revision snapshot into history!
    recordNoteSnapshot(state.activeNotePath, content, forceSnapshot);

    dom.saveStatusIndicator.textContent = 'Saved';
    dom.saveStatusIndicator.className = 'save-status saved';
  } catch (err) {
    console.error('Save error:', err);
    dom.saveStatusIndicator.textContent = 'Error Saving';
  }
}

function queueAutoSave() {
  state.isDirty = true;
  dom.saveStatusIndicator.textContent = 'Unsaved';
  dom.saveStatusIndicator.className = 'save-status saving';

  clearTimeout(state.saveTimeout);
  state.saveTimeout = setTimeout(() => {
    saveCurrentNote(false);
  }, 500);
}

async function createNewNote(customTitle = null) {
  try {
    // Default name is current date-month (DD-MM.md)
    const title = customTitle || getDefaultNoteName();
    const created = await noteManager.createNote(state.currentVaultPath, title);
    await refreshVault();
    openNote(created.filePath);
  } catch (err) {
    console.error('Create note failed:', err);
  }
}

async function deleteNote(filePath, fileName) {
  if (confirm(`Are you sure you want to delete "${fileName}"?`)) {
    await noteManager.deleteNote(filePath);
    if (state.activeNotePath === filePath) {
      state.activeNotePath = null;
      dom.markdownInput.value = '';
      dom.markdownPreview.innerHTML = '';
      dom.activeNoteBadge.textContent = 'No file open';
    }
    await refreshVault();

    const remaining = state.notesTree.filter(item => item.type === 'file' && item.path !== filePath);
    if (remaining.length > 0) openNote(remaining[0].path);
  }
}

// ==========================================
// PREVIEW & CHECKLISTS
// ==========================================

function schedulePreviewUpdate() {
  if (state.renderFrame) cancelAnimationFrame(state.renderFrame);
  state.renderFrame = requestAnimationFrame(() => {
    updatePreviewNow();
  });
}

function updatePreviewNow() {
  const raw = dom.markdownInput.value;
  dom.markdownPreview.innerHTML = renderMarkdown(raw);

  // Checkbox interactivity
  dom.markdownPreview.querySelectorAll('input[type="checkbox"]').forEach((checkbox, idx) => {
    checkbox.addEventListener('change', () => {
      dom.markdownInput.value = toggleTaskCheckbox(dom.markdownInput.value, idx, checkbox.checked);
      queueAutoSave();
      schedulePreviewUpdate();
    });
  });

  // Wiki links
  dom.markdownPreview.querySelectorAll('.wiki-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetTitle = link.getAttribute('data-target');
      const targetFile = state.notesTree.find(f => f.name.replace(/\.md$/, '').toLowerCase() === targetTitle.toLowerCase());
      if (targetFile) openNote(targetFile.path);
      else createNewNote(`${targetTitle}.md`);
    });
  });

  // Copy buttons on code blocks
  attachCodeCopyButtons(dom.markdownPreview);
  updateTagsCloud();
}

function updateTagsCloud() {
  const tags = extractTags(dom.markdownInput.value);
  dom.tagCloud.innerHTML = '';

  if (tags.length === 0) {
    dom.tagCloud.innerHTML = '<span style="font-size:10px; color:var(--text-faint);">No tags in note</span>';
    return;
  }

  tags.forEach(tag => {
    const tagEl = document.createElement('span');
    tagEl.className = 'tag-pill';
    tagEl.textContent = tag;
    tagEl.addEventListener('click', () => {
      dom.noteSearchInput.value = tag;
      dom.btnClearSearch.style.display = 'block';
      renderTreeUI();
    });
    dom.tagCloud.appendChild(tagEl);
  });
}

function updateStats() {
  const text = dom.markdownInput.value;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  dom.wordCount.textContent = `${words} words`;
  dom.charCount.textContent = `${text.length} chars`;
  dom.lineCount.textContent = `${text.split('\n').length} lines`;
}

// ==========================================
// SMART KEYBOARD & MULTI-WINDOW SYNC
// ==========================================

function setupSmartKeyboard() {
  setupSmartEditor(dom.markdownInput, {
    onChange: () => {
      queueAutoSave();
      schedulePreviewUpdate();
      updateStats();
    },
    onSave: () => saveCurrentNote(true)
  });
}

function setupCrossWindowSync() {
  window.pinNoteAPI.onFileSavedExternally((filePath, content) => {
    if (state.activeNotePath === filePath && !state.isDirty) {
      dom.markdownInput.value = content;
      updatePreviewNow();
      updateStats();
    }
  });

  window.pinNoteAPI.onFileRenamedExternally((oldPath, newPath) => {
    if (state.activeNotePath === oldPath) {
      state.activeNotePath = newPath;
      dom.activeNoteBadge.textContent = newPath.split(/[/\\]/).pop();
    }
    refreshVault();
  });

  window.pinNoteAPI.onFileDeletedExternally((filePath) => {
    if (state.activeNotePath === filePath) {
      state.activeNotePath = null;
      dom.markdownInput.value = '';
      dom.markdownPreview.innerHTML = '';
      dom.activeNoteBadge.textContent = 'No file open';
    }
    refreshVault();
  });

  window.pinNoteAPI.onVaultTreeChanged(() => {
    refreshVault();
  });
}

// ==========================================
// EVENT LISTENERS & SHORTCUTS
// ==========================================

function setupEventListeners() {
  // Vault Folder Picker
  dom.btnChangeVault.addEventListener('click', async () => {
    const chosen = await window.pinNoteAPI.selectVaultFolder();
    if (chosen) {
      state.currentVaultPath = chosen;
      localStorage.setItem('pinnote_vault_path', chosen);
      await refreshVault();
      const first = state.notesTree.find(item => item.type === 'file');
      if (first) openNote(first.path);
    }
  });

  dom.btnRefreshVault.addEventListener('click', () => refreshVault());
  dom.btnNewNote.addEventListener('click', () => createNewNote());

  // Search Filter in Sidebar
  dom.noteSearchInput.addEventListener('input', (e) => {
    const hasVal = e.target.value.length > 0;
    dom.btnClearSearch.style.display = hasVal ? 'block' : 'none';
    renderTreeUI();
  });

  dom.btnClearSearch.addEventListener('click', () => {
    dom.noteSearchInput.value = '';
    dom.btnClearSearch.style.display = 'none';
    renderTreeUI();
  });

  // Pop Out Sticky Window
  dom.btnPopoutNote.addEventListener('click', () => {
    if (state.activeNotePath) {
      window.pinNoteAPI.openDetachedNoteWindow(state.activeNotePath);
    }
  });

  // Note Revision History Button
  dom.btnNoteHistory.addEventListener('click', () => {
    if (state.activeNotePath) {
      historyModal.open(state.activeNotePath, dom.markdownInput.value);
    }
  });

  // Toggle Sidebar
  dom.btnToggleSidebar.addEventListener('click', () => {
    dom.sidebar.classList.toggle('collapsed');
  });

  // Editor Input Typing
  dom.markdownInput.addEventListener('input', () => {
    queueAutoSave();
    schedulePreviewUpdate();
    updateStats();
  });

  // Formatting Toolbar Buttons
  document.querySelectorAll('.fmt-btn[data-fmt]').forEach(btn => {
    btn.addEventListener('click', () => {
      const fmt = btn.getAttribute('data-fmt');
      if (fmt) {
        insertFormat(dom.markdownInput, fmt, () => {
          queueAutoSave();
          schedulePreviewUpdate();
          updateStats();
        });
      }
    });
  });

  // Quick Switcher Trigger
  dom.btnQuickSwitcher.addEventListener('click', () => {
    quickSwitcher.open(state.notesTree);
  });

  // Global Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    // Ctrl + P -> Pop out note to sticky
    if (e.ctrlKey && e.key.toLowerCase() === 'p' && !e.shiftKey) {
      e.preventDefault();
      if (state.activeNotePath) {
        window.pinNoteAPI.openDetachedNoteWindow(state.activeNotePath);
      }
    }
    // Ctrl + K -> Quick Switcher
    else if (e.ctrlKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      quickSwitcher.open(state.notesTree);
    }
    // Ctrl + H -> Note History
    else if (e.ctrlKey && e.key.toLowerCase() === 'h') {
      e.preventDefault();
      if (state.activeNotePath) {
        historyModal.open(state.activeNotePath, dom.markdownInput.value);
      }
    }
    // Ctrl + N -> New Note (default date-month name)
    else if (e.ctrlKey && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      createNewNote();
    }
    // Ctrl + S -> Force Save with snapshot
    else if (e.ctrlKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveCurrentNote(true);
    }
    // Ctrl + \ -> Toggle Sidebar
    else if (e.ctrlKey && e.key === '\\') {
      e.preventDefault();
      dom.sidebar.classList.toggle('collapsed');
    }
    // Ctrl + = / Ctrl + + -> Zoom In
    else if (e.ctrlKey && (e.key === '=' || e.key === '+')) {
      e.preventDefault();
      uiControls.setFontSize(uiControls.currentFontSize + 2);
    }
    // Ctrl + - -> Zoom Out
    else if (e.ctrlKey && e.key === '-') {
      e.preventDefault();
      uiControls.setFontSize(uiControls.currentFontSize - 2);
    }
    // Ctrl + 0 -> Reset Font Size to 20px
    else if (e.ctrlKey && e.key === '0') {
      e.preventDefault();
      uiControls.setFontSize(20);
    }
  });
}

// Run App
window.addEventListener('DOMContentLoaded', initApp);
