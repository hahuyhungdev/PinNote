/**
 * PinNote - UI Controls Module
 * Coordinates view modes, font zooming, window opacity, window controls, and synchronized scrolling
 */

class UIControls {
  constructor({ dom, onModeChange, onFontSizeChange }) {
    this.dom = dom;
    this.onModeChange = onModeChange;
    this.onFontSizeChange = onFontSizeChange;

    this.currentViewMode = localStorage.getItem('pinnote_view_mode') || 'split';
    this.currentFontSize = parseInt(localStorage.getItem('pinnote_font_size') || '20', 10);
    this.currentOpacity = parseFloat(localStorage.getItem('pinnote_opacity') || '1.0');

    this._bindEvents();
    this.applyInitialState();
  }

  applyInitialState() {
    this.setViewMode(this.currentViewMode);
    this.setFontSize(this.currentFontSize);

    if (this.dom.opacitySlider) {
      this.dom.opacitySlider.value = this.currentOpacity;
      if (this.dom.opacityValue) {
        this.dom.opacityValue.textContent = `${Math.round(this.currentOpacity * 100)}%`;
      }
      window.pinNoteAPI?.setWindowOpacity(this.currentOpacity);
    }
  }

  _bindEvents() {
    // View mode buttons
    this.dom.btnModeEditor?.addEventListener('click', () => this.setViewMode('editor'));
    this.dom.btnModeSplit?.addEventListener('click', () => this.setViewMode('split'));
    this.dom.btnModePreview?.addEventListener('click', () => this.setViewMode('preview'));

    // Zoom controls
    this.dom.btnZoomIn?.addEventListener('click', () => this.setFontSize(this.currentFontSize + 2));
    this.dom.btnZoomOut?.addEventListener('click', () => this.setFontSize(this.currentFontSize - 2));

    // Opacity slider
    this.dom.opacitySlider?.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      this.currentOpacity = val;
      if (this.dom.opacityValue) {
        this.dom.opacityValue.textContent = `${Math.round(val * 100)}%`;
      }
      window.pinNoteAPI?.setWindowOpacity(val);
      localStorage.setItem('pinnote_opacity', val);
    });

    // Window controls
    this.dom.winMin?.addEventListener('click', () => window.pinNoteAPI?.minimizeWindow());
    this.dom.winMax?.addEventListener('click', () => window.pinNoteAPI?.maximizeWindow());
    this.dom.winClose?.addEventListener('click', () => window.pinNoteAPI?.closeWindow());

    this.setupSyncScrolling();
  }

  setViewMode(mode) {
    this.currentViewMode = mode;
    this.dom.btnModeEditor?.classList.toggle('active', mode === 'editor');
    this.dom.btnModeSplit?.classList.toggle('active', mode === 'split');
    this.dom.btnModePreview?.classList.toggle('active', mode === 'preview');

    if (this.dom.workspaceContainer) {
      this.dom.workspaceContainer.className = `workspace-container mode-${mode}`;
    }

    localStorage.setItem('pinnote_view_mode', mode);
    this.onModeChange?.(mode);
  }

  setFontSize(size) {
    this.currentFontSize = Math.max(10, Math.min(36, size));
    document.documentElement.style.setProperty('--editor-font-size', `${this.currentFontSize}px`);

    if (this.dom.zoomLevelText) {
      this.dom.zoomLevelText.textContent = `${this.currentFontSize}px`;
    }

    localStorage.setItem('pinnote_font_size', this.currentFontSize);
    this.onFontSizeChange?.(this.currentFontSize);
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

module.exports = { UIControls };
