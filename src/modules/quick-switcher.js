/**
 * PinNote - Quick Switcher Component
 * Fuzzy modal search for rapidly navigating between vault notes (Ctrl + K)
 */

import { flattenNoteFiles, noteTitle } from './preview.js';

const FILE_ICON = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
  <polyline points="14 2 14 8 20 8"/>
</svg>`;

class QuickSwitcher {
  constructor({ modalEl, inputEl, resultsEl, onSelectNote }) {
    this.modalEl = modalEl;
    this.inputEl = inputEl;
    this.resultsEl = resultsEl;
    this.onSelectNote = onSelectNote;

    this.notes = [];
    this.filteredNotes = [];
    this.selectedIndex = 0;
    this.returnFocusEl = null;

    this._bindEvents();
  }

  _bindEvents() {
    this.modalEl.addEventListener('click', (e) => {
      if (e.target === this.modalEl) this.close();
    });

    this.inputEl.addEventListener('input', (e) => {
      this.filter(e.target.value);
    });

    this.inputEl.addEventListener('keydown', (e) => {
      // Escape must work even when nothing matches
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
        return;
      }
      if (this.filteredNotes.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.selectedIndex = (this.selectedIndex + 1) % this.filteredNotes.length;
        this.updateSelection();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.selectedIndex = (this.selectedIndex - 1 + this.filteredNotes.length) % this.filteredNotes.length;
        this.updateSelection();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this.choose(this.filteredNotes[this.selectedIndex]);
      }
    });
  }

  isOpen() {
    return !this.modalEl.classList.contains('hidden');
  }

  open(notesTree) {
    this.returnFocusEl = document.activeElement;
    this.notes = flattenNoteFiles(notesTree || []);
    this.inputEl.value = '';
    this.modalEl.classList.remove('hidden');
    this.filter('');
    this.inputEl.focus();
  }

  close() {
    this.modalEl.classList.add('hidden');
    this.returnFocusEl?.focus?.();
  }

  choose(note) {
    if (!note) return;
    this.close();
    this.onSelectNote?.(note.path);
  }

  filter(query) {
    const q = query.trim().toLowerCase();
    this.filteredNotes = this.notes.filter(note => {
      if (!q) return true;
      const title = noteTitle(note.name).toLowerCase();
      const pathText = (note.relativePath || note.path).toLowerCase();
      return title.includes(q) || pathText.includes(q);
    });

    this.selectedIndex = 0;
    this.render();
  }

  render() {
    this.resultsEl.innerHTML = '';

    if (this.filteredNotes.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'quick-empty';
      empty.textContent = 'No matching notes found';
      this.resultsEl.appendChild(empty);
      return;
    }

    this.filteredNotes.forEach((note, idx) => {
      const itemEl = document.createElement('div');
      itemEl.className = `quick-result-item ${idx === this.selectedIndex ? 'selected' : ''}`;
      itemEl.setAttribute('role', 'option');
      itemEl.innerHTML = `${FILE_ICON}<div class="result-text"><span class="result-title"></span><span class="result-path"></span></div>`;
      itemEl.querySelector('.result-title').textContent = noteTitle(note.name);
      itemEl.querySelector('.result-path').textContent = note.relativePath || note.path;

      itemEl.addEventListener('click', () => this.choose(note));
      this.resultsEl.appendChild(itemEl);
    });
  }

  updateSelection() {
    const items = this.resultsEl.querySelectorAll('.quick-result-item');
    items.forEach((item, idx) => {
      item.classList.toggle('selected', idx === this.selectedIndex);
      if (idx === this.selectedIndex) item.scrollIntoView({ block: 'nearest' });
    });
  }
}

export { QuickSwitcher };
