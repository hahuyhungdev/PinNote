/**
 * PinNote - Floating Desktop Sticky Note Controller
 * Individual Note Window with dedicated Always-On-Top screen pinning and live sync
 */

const { renderMarkdown, toggleTaskCheckbox, attachCodeCopyButtons } = require('./modules/markdown');
const { setupSmartEditor } = require('./modules/smart-editor');

const urlParams = new URLSearchParams(window.location.search);
let currentFilePath = urlParams.get('filePath');

const dom = {
  filename: document.getElementById('sticky-filename'),
  pin: document.getElementById('sticky-pin'),
  opacity: document.getElementById('sticky-opacity'),
  min: document.getElementById('sticky-min'),
  close: document.getElementById('sticky-close'),
  modeEdit: document.getElementById('mode-edit'),
  modeSplit: document.getElementById('mode-split'),
  modePrev: document.getElementById('mode-prev'),
  stickyZoomOut: document.getElementById('sticky-zoom-out'),
  stickyZoomIn: document.getElementById('sticky-zoom-in'),
  wordCount: document.getElementById('sticky-word-count'),
  status: document.getElementById('sticky-status'),
  body: document.getElementById('sticky-body'),
  input: document.getElementById('sticky-input'),
  preview: document.getElementById('sticky-preview')
};

let saveTimeout = null;
let isPinned = true;
let currentFontSize = 18;

function updateStats() {
  const text = dom.input.value;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  dom.wordCount.textContent = `${words}w`;
}

function updatePreview() {
  dom.preview.innerHTML = renderMarkdown(dom.input.value);

  // Checkbox interactivity
  dom.preview.querySelectorAll('input[type="checkbox"]').forEach((cb, idx) => {
    cb.addEventListener('change', () => {
      dom.input.value = toggleTaskCheckbox(dom.input.value, idx, cb.checked);
      queueSave();
      updatePreview();
    });
  });

  attachCodeCopyButtons(dom.preview);
  updateStats();
}

function setFontSize(size) {
  currentFontSize = Math.max(10, Math.min(36, size));
  document.documentElement.style.setProperty('--editor-font-size', `${currentFontSize}px`);
  dom.input.style.fontSize = `${currentFontSize}px`;
  dom.preview.style.fontSize = `${currentFontSize}px`;
}

function setViewMode(mode) {
  dom.modeEdit.classList.toggle('active', mode === 'edit');
  dom.modeSplit.classList.toggle('active', mode === 'split');
  dom.modePrev.classList.toggle('active', mode === 'prev');

  if (mode === 'edit') {
    dom.body.className = 'sticky-body';
    dom.input.style.display = 'block';
    dom.preview.style.display = 'none';
  } else if (mode === 'split') {
    dom.body.className = 'sticky-body sticky-split';
    dom.input.style.display = 'block';
    dom.preview.style.display = 'block';
    updatePreview();
  } else {
    dom.body.className = 'sticky-body';
    dom.input.style.display = 'none';
    dom.preview.style.display = 'block';
    updatePreview();
  }
}

function queueSave() {
  dom.status.textContent = 'Saving...';
  dom.status.className = 'save-status saving';
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    if (currentFilePath) {
      await window.pinNoteAPI.saveFileContent(currentFilePath, dom.input.value);
      dom.status.textContent = 'Saved';
      dom.status.className = 'save-status saved';
    }
  }, 400);
}

async function initSticky() {
  if (!currentFilePath) return;

  const updateTitle = (p) => {
    const name = p.split(/[/\\]/).pop().replace(/\.md$/, '');
    dom.filename.textContent = name;
    document.title = `${name} - Sticky Note`;
  };
  updateTitle(currentFilePath);

  // Set Warm White theme
  document.documentElement.setAttribute('data-theme', 'warm-white');

  // Read initial content
  const content = await window.pinNoteAPI.readFileContent(currentFilePath);
  dom.input.value = content || '';
  updatePreview();

  // Individual Note Always-On-Top Pin Toggle
  dom.pin.addEventListener('click', async () => {
    isPinned = await window.pinNoteAPI.toggleAlwaysOnTop();
    dom.pin.classList.toggle('pinned', isPinned);
    dom.pin.title = isPinned ? 'Sticky Note Pinned on Top' : 'Sticky Note Unpinned';
  });

  // Opacity
  dom.opacity.addEventListener('input', (e) => {
    window.pinNoteAPI.setWindowOpacity(parseFloat(e.target.value));
  });

  // Window Controls
  dom.min.addEventListener('click', () => window.pinNoteAPI.minimizeWindow());
  dom.close.addEventListener('click', () => window.pinNoteAPI.closeWindow());

  // View Modes
  dom.modeEdit.addEventListener('click', () => setViewMode('edit'));
  dom.modeSplit.addEventListener('click', () => setViewMode('split'));
  dom.modePrev.addEventListener('click', () => setViewMode('prev'));

  // Zoom
  dom.stickyZoomIn.addEventListener('click', () => setFontSize(currentFontSize + 2));
  dom.stickyZoomOut.addEventListener('click', () => setFontSize(currentFontSize - 2));

  // Smart Editor (Tab, Auto-closing pairs, smart list continuation, shortcuts)
  setupSmartEditor(dom.input, {
    onChange: () => {
      queueSave();
      if (dom.modeSplit.classList.contains('active')) {
        updatePreview();
      } else {
        updateStats();
      }
    },
    onSave: () => {
      clearTimeout(saveTimeout);
      window.pinNoteAPI.saveFileContent(currentFilePath, dom.input.value);
      dom.status.textContent = 'Saved';
      dom.status.className = 'save-status saved';
    }
  });

  // Typing auto-save
  dom.input.addEventListener('input', () => {
    queueSave();
    if (dom.modeSplit.classList.contains('active')) {
      updatePreview();
    } else {
      updateStats();
    }
  });

  // Cross-window live sync
  window.pinNoteAPI.onFileSavedExternally((savedPath, newContent) => {
    if (savedPath === currentFilePath && dom.input.value !== newContent) {
      const start = dom.input.selectionStart;
      const end = dom.input.selectionEnd;
      dom.input.value = newContent;
      dom.input.setSelectionRange(start, end);
      updatePreview();
      dom.status.textContent = 'Synced';
      setTimeout(() => { dom.status.textContent = 'Saved'; }, 1000);
    }
  });

  window.pinNoteAPI.onFileRenamedExternally((oldPath, newPath) => {
    if (oldPath === currentFilePath) {
      currentFilePath = newPath;
      updateTitle(newPath);
    }
  });

  window.pinNoteAPI.onFileDeletedExternally((deletedPath) => {
    if (deletedPath === currentFilePath) {
      window.pinNoteAPI.closeWindow();
    }
  });
}

window.addEventListener('DOMContentLoaded', initSticky);
