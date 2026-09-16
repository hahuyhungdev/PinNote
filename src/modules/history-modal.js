/**
 * PinNote - Note Revision History Modal Component
 * Renders list of past snapshots, markdown preview, and restore mechanism
 */

const { formatRelativeTime, formatExactTime, fetchNoteHistory, restoreNoteRevision } = require('./history');
const { renderMarkdown, attachCodeCopyButtons } = require('./markdown');

class HistoryModal {
  constructor({ modalEl, onRestoreNote }) {
    this.modalEl = modalEl;
    this.onRestoreNote = onRestoreNote;
    this.activeFilePath = null;
    this.snapshots = [];
    this.selectedSnapshot = null;

    this.titleEl = modalEl.querySelector('#history-modal-title');
    this.subtitleEl = modalEl.querySelector('#history-modal-subtitle');
    this.listEl = modalEl.querySelector('#history-snapshots-list');
    this.previewMetaEl = modalEl.querySelector('#history-preview-meta');
    this.previewContentEl = modalEl.querySelector('#history-preview-content');
    this.restoreBtn = modalEl.querySelector('#btn-restore-version');
    this.closeBtn = modalEl.querySelector('#btn-close-history');

    this._bindEvents();
  }

  _bindEvents() {
    this.closeBtn?.addEventListener('click', () => this.close());
    
    this.modalEl.addEventListener('click', (e) => {
      if (e.target === this.modalEl) this.close();
    });

    this.restoreBtn?.addEventListener('click', async () => {
      if (!this.selectedSnapshot || !this.activeFilePath) return;
      const timeLabel = formatExactTime(this.selectedSnapshot.timestamp);
      if (!confirm(`Restore this version from ${timeLabel}?\n\nYour current note will be saved first so you can always undo.`)) {
        return;
      }

      try {
        const result = await restoreNoteRevision(this.activeFilePath, this.selectedSnapshot.id);
        if (result && result.success && typeof this.onRestoreNote === 'function') {
          this.onRestoreNote(this.activeFilePath, result.content);
        }
        this.close();
      } catch (err) {
        alert(`Failed to restore note: ${err.message}`);
      }
    });

    window.addEventListener('keydown', (e) => {
      if (!this.isOpen()) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      }
    });
  }

  isOpen() {
    return !this.modalEl.classList.contains('hidden');
  }

  async open(filePath, currentContent) {
    if (!filePath) return;
    this.activeFilePath = filePath;
    const fileName = filePath.split(/[/\\]/).pop();

    if (this.titleEl) this.titleEl.textContent = `Revision History: ${fileName}`;
    if (this.subtitleEl) this.subtitleEl.textContent = filePath;

    this.modalEl.classList.remove('hidden');
    this.listEl.innerHTML = '<div class="history-loading">Loading revisions...</div>';
    this.previewContentEl.innerHTML = '<div class="history-empty-hint">Loading preview...</div>';
    if (this.restoreBtn) this.restoreBtn.disabled = true;

    try {
      this.snapshots = await fetchNoteHistory(filePath);
      this.renderSnapshotsList(currentContent);
    } catch (err) {
      this.listEl.innerHTML = `<div class="history-error">Error loading revisions: ${err.message}</div>`;
    }
  }

  close() {
    this.modalEl.classList.add('hidden');
    this.selectedSnapshot = null;
  }

  renderSnapshotsList(currentContent) {
    this.listEl.innerHTML = '';

    if (!this.snapshots || this.snapshots.length === 0) {
      this.listEl.innerHTML = `
        <div class="history-empty-state">
          <p style="font-weight: 500; margin-bottom: 6px;">No previous versions yet</p>
          <small style="color: var(--text-faint); font-size: 11px;">Revisions are saved automatically as you write and edit.</small>
        </div>
      `;
      if (this.previewMetaEl) this.previewMetaEl.textContent = 'No past revisions to display';
      if (this.previewContentEl) {
        this.previewContentEl.innerHTML = '<div class="history-empty-hint">Your current note is the earliest recorded version.</div>';
      }
      if (this.restoreBtn) this.restoreBtn.disabled = true;
      return;
    }

    this.snapshots.forEach((snap, idx) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'history-item';
      if (idx === 0) itemEl.classList.add('active');

      const isCurrentContent = currentContent !== undefined && snap.content === currentContent;
      const tagText = snap.tag ? `<span class="history-tag">${snap.tag}</span>` : '';
      const currentTag = isCurrentContent ? '<span class="history-tag current">Current</span>' : '';

      itemEl.innerHTML = `
        <div class="history-item-top">
          <span class="history-item-time">${formatRelativeTime(snap.timestamp)}</span>
          <div class="history-item-badges">${tagText}${currentTag}</div>
        </div>
        <div class="history-item-meta">
          <span>${formatExactTime(snap.timestamp)}</span>
        </div>
        <div class="history-item-stats">
          <span>${snap.words || 0} words • ${snap.chars || 0} chars</span>
        </div>
        <div class="history-item-snippet">${this._escapeHtml(snap.preview || '')}</div>
      `;

      itemEl.addEventListener('click', () => {
        this.selectSnapshot(snap, itemEl);
      });

      this.listEl.appendChild(itemEl);
    });

    // Auto-select top snapshot
    if (this.snapshots.length > 0) {
      this.selectSnapshot(this.snapshots[0], this.listEl.firstElementChild);
    }
  }

  selectSnapshot(snap, element) {
    this.selectedSnapshot = snap;
    this.listEl.querySelectorAll('.history-item').forEach(el => el.classList.remove('active'));
    if (element) element.classList.add('active');

    if (this.previewMetaEl) {
      this.previewMetaEl.textContent = `Revision from ${formatExactTime(snap.timestamp)} (${snap.words || 0} words, ${snap.chars || 0} characters)`;
    }

    if (this.previewContentEl) {
      this.previewContentEl.innerHTML = renderMarkdown(snap.content || '');
      attachCodeCopyButtons(this.previewContentEl);
    }

    if (this.restoreBtn) {
      this.restoreBtn.disabled = false;
    }
  }

  _escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}

module.exports = { HistoryModal };
