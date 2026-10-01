/**
 * PinNote - UI Controls Module
 * Coordinates view modes, editor font zoom, interface scale, window opacity,
 * window controls, and synchronized scrolling
 */

const FONT_MIN = 10;
const FONT_MAX = 40;
const FONT_DEFAULT = 20;

// Interface scale multiplies the root rem size; every chrome measurement is in rem
const UI_SCALES = [0.875, 1, 1.125, 1.25, 1.375, 1.5];
const UI_SCALE_DEFAULT = 1;

function readNumber(key, fallback) {
  const val = parseFloat(localStorage.getItem(key));
  return Number.isFinite(val) ? val : fallback;
}

class UIControls {
  constructor({ dom, onModeChange, onFontSizeChange }) {
    this.dom = dom;
    this.onModeChange = onModeChange;
    this.onFontSizeChange = onFontSizeChange;

    const savedMode = localStorage.getItem('pinnote_view_mode');
    this.currentViewMode = ['editor', 'split', 'preview'].includes(savedMode) ? savedMode : 'split';
    this.currentFontSize = readNumber('pinnote_font_size', FONT_DEFAULT);
    this.currentUiScale = readNumber('pinnote_ui_scale', UI_SCALE_DEFAULT);
    this.currentOpacity = readNumber('pinnote_opacity', 1.0);

    this._bindEvents();
    this.applyInitialState();
  }

  applyInitialState() {
    this.setViewMode(this.currentViewMode);
    this.setFontSize(this.currentFontSize);
    this.setUiScale(this.currentUiScale);

    if (this.dom.opacitySlider) {
      this.dom.opacitySlider.value = this.currentOpacity;
      this._renderOpacity(this.currentOpacity);
      window.pinNoteAPI?.setWindowOpacity(this.currentOpacity);
    }
  }

  _bindEvents() {
    // View mode buttons
    this.dom.btnModeEditor?.addEventListener('click', () => this.setViewMode('editor'));
    this.dom.btnModeSplit?.addEventListener('click', () => this.setViewMode('split'));
    this.dom.btnModePreview?.addEventListener('click', () => this.setViewMode('preview'));

    // Editor text zoom
    this.dom.btnZoomIn?.addEventListener('click', () => this.zoomEditor(1));
    this.dom.btnZoomOut?.addEventListener('click', () => this.zoomEditor(-1));

    // Interface scale
    this.dom.btnUiSmaller?.addEventListener('click', () => this.stepUiScale(-1));
    this.dom.btnUiLarger?.addEventListener('click', () => this.stepUiScale(1));
    this.dom.uiScaleText?.addEventListener('click', () => this.setUiScale(UI_SCALE_DEFAULT));

    // Opacity slider
    this.dom.opacitySlider?.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      this.currentOpacity = val;
      this._renderOpacity(val);
      window.pinNoteAPI?.setWindowOpacity(val);
      localStorage.setItem('pinnote_opacity', val);
    });

    // Window controls
    this.dom.winMin?.addEventListener('click', () => window.pinNoteAPI?.minimizeWindow());
    this.dom.winMax?.addEventListener('click', () => window.pinNoteAPI?.maximizeWindow());
    this.dom.winClose?.addEventListener('click', () => window.pinNoteAPI?.closeWindow());
    window.pinNoteAPI?.onMaximizedState((isMax) => {
      if (this.dom.winMax) this.dom.winMax.title = isMax ? 'Restore' : 'Maximize';
    });

    this.setupSyncScrolling();
  }

  _renderOpacity(val) {
    if (this.dom.opacityValue) this.dom.opacityValue.textContent = `${Math.round(val * 100)}%`;
  }

  setViewMode(mode) {
    this.currentViewMode = mode;
    const buttons = { editor: this.dom.btnModeEditor, split: this.dom.btnModeSplit, preview: this.dom.btnModePreview };
    Object.entries(buttons).forEach(([key, btn]) => {
      btn?.classList.toggle('active', key === mode);
      btn?.setAttribute('aria-pressed', String(key === mode));
    });

    if (this.dom.workspaceContainer) {
      this.dom.workspaceContainer.className = `workspace-container mode-${mode}`;
    }

    localStorage.setItem('pinnote_view_mode', mode);
    this.onModeChange?.(mode);
  }

  zoomEditor(direction) {
    this.setFontSize(this.currentFontSize + direction * 2);
  }

  resetEditorZoom() {
    this.setFontSize(FONT_DEFAULT);
  }

  setFontSize(size) {
    this.currentFontSize = Math.max(FONT_MIN, Math.min(FONT_MAX, Math.round(size)));
    document.documentElement.style.setProperty('--editor-font-size', `${this.currentFontSize}px`);

    if (this.dom.zoomLevelText) {
      this.dom.zoomLevelText.textContent = `${this.currentFontSize}px`;
    }

    localStorage.setItem('pinnote_font_size', this.currentFontSize);
    this.onFontSizeChange?.(this.currentFontSize);
  }

  stepUiScale(direction) {
    const idx = UI_SCALES.findIndex(s => s >= this.currentUiScale - 0.001);
    const current = idx === -1 ? UI_SCALES.indexOf(UI_SCALE_DEFAULT) : idx;
    const next = Math.max(0, Math.min(UI_SCALES.length - 1, current + direction));
    this.setUiScale(UI_SCALES[next]);
  }

  resetUiScale() {
    this.setUiScale(UI_SCALE_DEFAULT);
  }

  setUiScale(scale) {
    const clamped = Math.max(UI_SCALES[0], Math.min(UI_SCALES[UI_SCALES.length - 1], scale));
    this.currentUiScale = clamped;
    document.documentElement.style.setProperty('--ui-scale', String(clamped));
    if (this.dom.uiScaleText) this.dom.uiScaleText.textContent = `${Math.round(clamped * 100)}%`;
    localStorage.setItem('pinnote_ui_scale', clamped);
  }

  setupSyncScrolling() {
    if (!this.dom.markdownInput || !this.dom.previewWrapper) return;

    let isEditorScrolling = false;
    let isPreviewScrolling = false;

    this.dom.markdownInput.addEventListener('scroll', () => {
      if (isPreviewScrolling || this.currentViewMode !== 'split') return;
      isEditorScrolling = true;
      const ratio = this.dom.markdownInput.scrollTop / (this.dom.markdownInput.scrollHeight - this.dom.markdownInput.clientHeight || 1);
      this.dom.previewWrapper.scrollTop = ratio * (this.dom.previewWrapper.scrollHeight - this.dom.previewWrapper.clientHeight);
      setTimeout(() => { isEditorScrolling = false; }, 40);
    });

    this.dom.previewWrapper.addEventListener('scroll', () => {
      if (isEditorScrolling || this.currentViewMode !== 'split') return;
      isPreviewScrolling = true;
      const ratio = this.dom.previewWrapper.scrollTop / (this.dom.previewWrapper.scrollHeight - this.dom.previewWrapper.clientHeight || 1);
      this.dom.markdownInput.scrollTop = ratio * (this.dom.markdownInput.scrollHeight - this.dom.markdownInput.clientHeight);
      setTimeout(() => { isPreviewScrolling = false; }, 40);
    });
  }
}

export { UIControls };
