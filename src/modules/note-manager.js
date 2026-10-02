/**
 * PinNote - Note & Vault Management Module
 * Handles default date-month note naming, note tree rendering, pin toggling, and file lifecycle
 */

import { flattenNoteFiles, noteTitle } from './preview.js';
import { STATUS_LABELS } from './note-status.js';
import { buildTreeView } from './note-filter.js';

const ICONS = {
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
  popout: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
  rename: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  pin: '<line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-2l-2-2V5a2 2 0 0 0-2-2h-6a2 2 0 0 0-2 2v8l-2 2v2z"/>',
  chevron: '<polyline points="9 6 15 12 9 18"/>',
  folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  folderOpen: '<path d="M6 14l1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6A2 2 0 0 1 18.45 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"/>',
  focus: '<circle cx="12" cy="12" r="3"/><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>'
};

const icon = (name, size = 16) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

function getDefaultNoteName() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${day}-${month}.md`;
}

function readPinned() {
  try {
    const parsed = JSON.parse(localStorage.getItem('pinnote_pinned_notes') || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

class NoteManager {
  constructor() {
    this.pinnedNotes = readPinned();
  }

  _persistPinned() {
    localStorage.setItem('pinnote_pinned_notes', JSON.stringify(this.pinnedNotes));
  }

  isPinned(path) {
    return this.pinnedNotes.includes(path);
  }

  togglePin(path) {
    this.pinnedNotes = this.isPinned(path)
      ? this.pinnedNotes.filter(p => p !== path)
      : [...this.pinnedNotes, path];
    this._persistPinned();
    return this.isPinned(path);
  }

  updatePinnedPath(oldPath, newPath) {
    if (this.isPinned(oldPath)) {
      this.pinnedNotes = this.pinnedNotes.map(p => p === oldPath ? newPath : p);
      this._persistPinned();
    }
  }

  removePinnedPath(path) {
    this.pinnedNotes = this.pinnedNotes.filter(p => p !== path);
    this._persistPinned();
  }

  async createNote(vaultPath, customTitle = null) {
    return await window.pinNoteAPI.createNewNote(vaultPath, customTitle || getDefaultNoteName());
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

  /**
   * Text search lists matches flat (with their folder); otherwise notes are shown in their folders.
   * @param {object} [view]
   * @param {string[]|null} [view.tagMatches] when searching by #tag, the matching note paths
   * @param {string} [view.status] status filter: all, open, todo, doing, waiting or done
   * @param {string|null} [view.scope] folder path the sidebar is narrowed to
   * @param {Set<string>} [view.collapsed] folder paths the user collapsed
   */
  renderTree(items, container, filterQuery = '', activeNotePath = null, callbacks = {},
    { tagMatches = null, status = 'all', scope = null, collapsed = new Set() } = {}) {
    if (!container) return;
    container.innerHTML = '';

    if (flattenNoteFiles(items).length === 0 && !items.some(i => i.type === 'directory')) {
      container.appendChild(this._emptyState('No notes yet — press Ctrl+N to create one'));
      return;
    }

    const cleanQuery = filterQuery.trim().toLowerCase();
    const textSearch = cleanQuery && !tagMatches;
    const tree = buildTreeView(items, { status, tagMatches, scope });
    const ctx = { activeNotePath, callbacks };

    const matchingFiles = flattenNoteFiles(tree).filter(f => !textSearch
      || f.name.toLowerCase().includes(cleanQuery)
      || (f.relativePath || '').toLowerCase().includes(cleanQuery));

    if (matchingFiles.length === 0 && (textSearch || !tree.length)) {
      const message = tagMatches ? `No notes tagged ${filterQuery.trim()}`
        : textSearch ? 'No matching notes'
        : status === 'all' ? 'This folder is empty'
        : 'No notes with this status here';
      container.appendChild(this._emptyState(message));
      return;
    }

    const pinnedFiles = matchingFiles.filter(f => this.isPinned(f.path));
    if (pinnedFiles.length > 0) {
      container.appendChild(this._sectionTitle('Pinned'));
      pinnedFiles.forEach(file => this._createNoteItemElement(file, container, { ...ctx, isPinned: true }));
    }

    container.appendChild(this._sectionTitle(`${pinnedFiles.length ? 'All notes' : 'Notes'} · ${matchingFiles.length}`));
    if (textSearch) {
      matchingFiles.forEach(file => this._createNoteItemElement(file, container, { ...ctx, isPinned: this.isPinned(file.path) }));
      return;
    }

    // While a filter is active, open every folder so matches are never hidden in a collapsed one
    const filtering = status !== 'all' || Boolean(tagMatches);
    this._renderNodes(tree, container, 0, { ...ctx, collapsed: filtering ? new Set() : collapsed });
  }

  _renderNodes(nodes, parent, depth, ctx) {
    for (const node of nodes) {
      if (node.type === 'directory') this._createFolderElement(node, parent, depth, ctx);
      else this._createNoteItemElement(node, parent, { ...ctx, isPinned: this.isPinned(node.path), depth, showFolder: false });
    }
  }

  _createFolderElement(folder, parent, depth, ctx) {
    const expanded = !ctx.collapsed.has(folder.path);
    const node = document.createElement('div');
    node.className = 'folder-node';
    node.dataset.path = folder.path;

    const row = document.createElement('div');
    row.className = 'folder-item';
    row.tabIndex = 0;
    row.setAttribute('role', 'treeitem');
    row.setAttribute('aria-expanded', String(expanded));
    row.style.setProperty('--depth', depth);
    row.title = folder.relativePath || folder.name;
    row.innerHTML = `
      <span class="folder-chevron">${icon('chevron', 14)}</span>
      <span class="folder-icon">${icon(expanded ? 'folderOpen' : 'folder', 15)}</span>
      <span class="folder-name"></span>
      <span class="folder-count"></span>
      <div class="folder-actions">
        <button type="button" class="note-btn" data-action="scope" title="Show only this folder">${icon('focus', 15)}</button>
      </div>
    `;
    row.querySelector('.folder-name').textContent = folder.name;
    row.querySelector('.folder-count').textContent = String(folder.count);

    const toggle = () => ctx.callbacks.onToggleFolder?.(folder.path);
    row.addEventListener('click', (e) => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (!action) return toggle();
      e.stopPropagation();
      if (action === 'scope') ctx.callbacks.onScopeFolder?.(folder.path);
    });
    row.addEventListener('keydown', (e) => {
      if (e.target !== row) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      else if ((e.key === 'ArrowLeft' && expanded) || (e.key === 'ArrowRight' && !expanded)) { e.preventDefault(); toggle(); }
    });

    node.appendChild(row);
    if (expanded) {
      const children = document.createElement('div');
      children.className = 'folder-children';
      children.setAttribute('role', 'group');
      children.style.setProperty('--depth', depth);
      this._renderNodes(folder.children, children, depth + 1, ctx);
      node.appendChild(children);
    }
    parent.appendChild(node);
  }

  _emptyState(text) {
    const el = document.createElement('div');
    el.className = 'tree-empty';
    el.textContent = text;
    return el;
  }

  _sectionTitle(text) {
    const el = document.createElement('div');
    el.className = 'section-title';
    el.textContent = text;
    return el;
  }

  _createNoteItemElement(file, container, { isPinned, activeNotePath, callbacks, depth = 0, showFolder = true }) {
    const itemEl = document.createElement('div');
    itemEl.className = `note-item${activeNotePath === file.path ? ' active' : ''}${isPinned ? ' pinned-note-item' : ''}`;
    itemEl.tabIndex = 0;
    itemEl.style.setProperty('--depth', depth);

    // Inside the folder tree the location is already visible; flat lists show it under the title
    const folder = showFolder ? (file.relativePath || '').split(/[/\\]/).slice(0, -1).join(' / ') : '';

    itemEl.innerHTML = `
      <div class="note-title-group" title="Double click to rename">
        <span class="note-icon">${icon('file', 15)}</span>
        <span class="note-text">
          <span class="note-title"></span>
          ${folder ? '<span class="note-folder"></span>' : ''}
        </span>
      </div>
      <div class="note-item-actions">
        <button type="button" class="note-btn" data-action="popout" title="Open as floating sticky note">${icon('popout', 15)}</button>
        <button type="button" class="note-btn" data-action="rename" title="Rename note">${icon('rename', 15)}</button>
        <button type="button" class="note-btn note-pin-btn${isPinned ? ' is-pinned' : ''}" data-action="pin" title="${isPinned ? 'Unpin from sidebar' : 'Pin to top of sidebar'}">${icon('pin', 15)}</button>
        <button type="button" class="note-btn note-delete-btn" data-action="delete" title="Delete note">${icon('trash', 15)}</button>
      </div>
    `;

    const titleSpan = itemEl.querySelector('.note-title');
    titleSpan.textContent = noteTitle(file.name);
    if (STATUS_LABELS[file.status]) {
      const badge = document.createElement('span');
      badge.className = 'note-status';
      badge.dataset.status = file.status;
      badge.textContent = STATUS_LABELS[file.status];
      itemEl.querySelector('.note-title-group').appendChild(badge);
      itemEl.classList.toggle('is-done', file.status === 'done');
    }
    if (folder) itemEl.querySelector('.note-folder').textContent = folder;

    itemEl.querySelector('.note-title-group').addEventListener('dblclick', (e) => {
      e.stopPropagation();
      this.inlineRename(file.path, titleSpan, callbacks.onRename);
    });

    itemEl.addEventListener('click', (e) => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (action) e.stopPropagation();

      switch (action) {
        case 'delete': callbacks.onDelete?.(file.path, file.name); break;
        case 'pin': this.togglePin(file.path); callbacks.onPinToggle?.(file.path); break;
        case 'popout': window.pinNoteAPI.openDetachedNoteWindow(file.path); break;
        case 'rename': this.inlineRename(file.path, titleSpan, callbacks.onRename); break;
        default: callbacks.onOpen?.(file.path);
      }
    });

    itemEl.addEventListener('keydown', (e) => {
      if (e.target !== itemEl) return;
      if (e.key === 'Enter') callbacks.onOpen?.(file.path);
      else if (e.key === 'F2') this.inlineRename(file.path, titleSpan, callbacks.onRename);
      else if (e.key === 'Delete') callbacks.onDelete?.(file.path, file.name);
    });

    container.appendChild(itemEl);
  }

  /**
   * Swap a title element for an input; commit on Enter/blur, cancel on Escape
   */
  inlineRename(oldPath, titleEl, onRenameCallback, { inputClass = 'inline-rename-input', onDone } = {}) {
    if (!titleEl.isConnected) return;
    const currentName = titleEl.textContent;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = inputClass;
    input.value = currentName;
    input.setAttribute('aria-label', 'New note name');
    titleEl.replaceWith(input);
    input.focus();
    input.select();

    let committed = false;
    const restore = () => {
      if (input.isConnected) input.replaceWith(titleEl);
      onDone?.();
    };

    const commit = async () => {
      if (committed) return;
      committed = true;
      const newName = input.value.trim();
      if (!newName || newName === currentName) {
        restore();
        return;
      }
      try {
        const newPath = await this.renameNote(oldPath, newName);
        titleEl.textContent = noteTitle(newPath.split(/[/\\]/).pop());
        restore();
        onRenameCallback?.(oldPath, newPath);
      } catch (err) {
        restore();
        alert(`Could not rename note: ${err.message}`);
      }
    };

    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') { e.preventDefault(); committed = true; restore(); }
    });
    input.addEventListener('blur', commit);
  }
}

export {
  NoteManager,
  getDefaultNoteName
};
