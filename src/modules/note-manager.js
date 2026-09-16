/**
 * PinNote - Note & Vault Management Module
 * Handles default date-month note naming, note tree rendering, pin toggling, and file lifecycle
 */

function getDefaultNoteName() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${day}-${month}.md`;
}

class NoteManager {
  constructor() {
    this.pinnedNotes = JSON.parse(localStorage.getItem('pinnote_pinned_notes') || '[]');
  }

  isPinned(path) {
    return this.pinnedNotes.includes(path);
  }

  togglePin(path) {
    if (this.isPinned(path)) {
      this.pinnedNotes = this.pinnedNotes.filter(p => p !== path);
    } else {
      this.pinnedNotes.push(path);
    }
    localStorage.setItem('pinnote_pinned_notes', JSON.stringify(this.pinnedNotes));
    return this.isPinned(path);
  }

  updatePinnedPath(oldPath, newPath) {
    if (this.isPinned(oldPath)) {
      this.pinnedNotes = this.pinnedNotes.map(p => p === oldPath ? newPath : p);
      localStorage.setItem('pinnote_pinned_notes', JSON.stringify(this.pinnedNotes));
    }
  }

  removePinnedPath(path) {
    this.pinnedNotes = this.pinnedNotes.filter(p => p !== path);
    localStorage.setItem('pinnote_pinned_notes', JSON.stringify(this.pinnedNotes));
  }

  async createNote(vaultPath, customTitle = null) {
    const titleToUse = customTitle || getDefaultNoteName();
    return await window.pinNoteAPI.createNewNote(vaultPath, titleToUse);
  }

  async readNote(filePath) {
    return await window.pinNoteAPI.readFileContent(filePath);
  }

  async saveNote(filePath, content) {
    return await window.pinNoteAPI.saveFileContent(filePath, content);
  }

  async deleteNote(filePath) {
    this.removePinnedPath(filePath);
    return await window.pinNoteAPI.deleteFile(filePath);
  }

  async renameNote(oldPath, newName) {
    const newPath = await window.pinNoteAPI.renameFile(oldPath, newName);
    this.updatePinnedPath(oldPath, newPath);
    return newPath;
  }

  renderTree(items, container, filterQuery = '', activeNotePath = null, callbacks = {}) {
    if (!container) return;
    container.innerHTML = '';
    const files = items.filter(i => i.type === 'file');

    if (files.length === 0) {
      container.innerHTML = '<div style="padding:12px; font-size:11px; color:var(--text-faint);">No notes found</div>';
      return;
    }

    const cleanQuery = filterQuery.trim().toLowerCase();
    const matchingFiles = files.filter(f => !cleanQuery || f.name.toLowerCase().includes(cleanQuery));

    if (matchingFiles.length === 0) {
      container.innerHTML = '<div style="padding:12px; font-size:11px; color:var(--text-faint);">No matching notes</div>';
      return;
    }

    const pinnedFiles = matchingFiles.filter(f => this.isPinned(f.path));
    const unpinnedFiles = matchingFiles.filter(f => !this.isPinned(f.path));

    // Pinned notes section
    if (pinnedFiles.length > 0) {
      const pinnedHeader = document.createElement('div');
      pinnedHeader.className = 'section-title';
      pinnedHeader.style.marginTop = '4px';
      pinnedHeader.textContent = '📌 PINNED NOTES';
      container.appendChild(pinnedHeader);

      pinnedFiles.forEach(file => {
        this._createNoteItemElement(file, container, true, activeNotePath, callbacks);
      });
    }

    // All notes section
    if (unpinnedFiles.length > 0) {
      const allHeader = document.createElement('div');
      allHeader.className = 'section-title';
      allHeader.style.marginTop = pinnedFiles.length > 0 ? '12px' : '4px';
      allHeader.textContent = 'ALL NOTES';
      container.appendChild(allHeader);

      unpinnedFiles.forEach(file => {
        this._createNoteItemElement(file, container, false, activeNotePath, callbacks);
      });
    }
  }

  _createNoteItemElement(file, container, isPinned, activeNotePath, callbacks) {
    const itemEl = document.createElement('div');
    itemEl.className = `note-item ${activeNotePath === file.path ? 'active' : ''} ${isPinned ? 'pinned-note-item' : ''}`;

    const baseName = file.name.replace(/\.md$/, '');

    itemEl.innerHTML = `
      <div class="note-title-group" title="Double click to rename">
        <svg class="note-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        <span class="note-title">${baseName}</span>
      </div>
      <div class="note-item-actions">
        <button class="note-popout-btn" title="Pin Note to Desktop (Floating Sticky)">🖼️</button>
        <button class="note-rename-btn" title="Rename Note">✏️</button>
        <button class="note-pin-btn ${isPinned ? 'is-pinned' : ''}" title="${isPinned ? 'Unpin from Sidebar' : 'Pin to Sidebar'}">📌</button>
        <button class="note-actions-btn" title="Delete Note">&times;</button>
      </div>
    `;

    const titleGroup = itemEl.querySelector('.note-title-group');
    const titleSpan = itemEl.querySelector('.note-title');

    titleGroup.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      this.inlineRename(file.path, titleSpan, callbacks.onRename);
    });

    itemEl.addEventListener('click', (e) => {
      if (e.target.classList.contains('note-actions-btn')) {
        e.stopPropagation();
        callbacks.onDelete?.(file.path, file.name);
      } else if (e.target.classList.contains('note-pin-btn')) {
        e.stopPropagation();
        this.togglePin(file.path);
        callbacks.onPinToggle?.(file.path);
      } else if (e.target.classList.contains('note-popout-btn')) {
        e.stopPropagation();
        window.pinNoteAPI.openDetachedNoteWindow(file.path);
      } else if (e.target.classList.contains('note-rename-btn')) {
        e.stopPropagation();
        this.inlineRename(file.path, titleSpan, callbacks.onRename);
      } else {
        callbacks.onOpen?.(file.path);
      }
    });

    container.appendChild(itemEl);
  }

  inlineRename(oldPath, titleSpan, onRenameCallback) {
    const currentName = titleSpan.textContent;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'inline-rename-input';
    input.value = currentName;
    titleSpan.replaceWith(input);
    input.focus();
    input.select();

    let committed = false;
    const commit = async () => {
      if (committed) return;
      committed = true;
      const newName = input.value.trim().replace(/[\\/:*?"<>|]/g, '');
      if (!newName || newName === currentName) {
        input.replaceWith(titleSpan);
        return;
      }
      try {
        const newPath = await this.renameNote(oldPath, newName);
        onRenameCallback?.(oldPath, newPath, newName);
      } catch (err) {
        console.error('Rename failed:', err);
        input.replaceWith(titleSpan);
      }
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') { committed = true; input.replaceWith(titleSpan); }
    });

    input.addEventListener('blur', commit);
  }
}

module.exports = {
  NoteManager,
  getDefaultNoteName
};
