/**
 * PinNote - Quick Switcher Component
 * Fuzzy modal search for rapidly navigating between vault notes (Ctrl + K)
 */

class QuickSwitcher {
  constructor({ modalEl, inputEl, resultsEl, onSelectNote }) {
    this.modalEl = modalEl;
    this.inputEl = inputEl;
    this.resultsEl = resultsEl;
    this.onSelectNote = onSelectNote;

    this.notes = [];
    this.filteredNotes = [];
    this.selectedIndex = 0;

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
        const target = this.filteredNotes[this.selectedIndex];
        if (target) {
          this.onSelectNote?.(target.path);
          this.close();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      }
    });
  }

  isOpen() {
    return !this.modalEl.classList.contains('hidden');
  }

  open(notesTree) {
    this.notes = (notesTree || []).filter(item => item.type === 'file');
    this.inputEl.value = '';
    this.selectedIndex = 0;
    this.modalEl.classList.remove('hidden');
    this.filter('');
    this.inputEl.focus();
  }

  close() {
    this.modalEl.classList.add('hidden');
  }

  filter(query) {
    const q = query.trim().toLowerCase();
    this.filteredNotes = this.notes.filter(note => {
      if (!q) return true;
      const title = note.name.replace(/\.md$/, '').toLowerCase();
      const pathText = (note.relativePath || note.path).toLowerCase();
      return title.includes(q) || pathText.includes(q);
    });

    this.selectedIndex = 0;
    this.render();
  }

  render() {
    this.resultsEl.innerHTML = '';

    if (this.filteredNotes.length === 0) {
      this.resultsEl.innerHTML = '<div style="padding:14px; text-align:center; color:var(--text-faint); font-size:12px;">No matching notes found</div>';
      return;
    }

    this.filteredNotes.forEach((note, idx) => {
      const itemEl = document.createElement('div');
      itemEl.className = `quick-result-item ${idx === this.selectedIndex ? 'selected' : ''}`;
      
      const title = note.name.replace(/\.md$/, '');
      const pathRel = note.relativePath || note.path;

      itemEl.innerHTML = `
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        <div class="result-text">
          <span class="result-title">${title}</span>
          <span class="result-path">${pathRel}</span>
        </div>
      `;

      itemEl.addEventListener('click', () => {
        this.onSelectNote?.(note.path);
        this.close();
      });

      this.resultsEl.appendChild(itemEl);
    });
  }

  updateSelection() {
    const items = this.resultsEl.querySelectorAll('.quick-result-item');
    items.forEach((item, idx) => {
      item.classList.toggle('selected', idx === this.selectedIndex);
      if (idx === this.selectedIndex) {
        item.scrollIntoView({ block: 'nearest' });
      }
    });
  }
}

module.exports = { QuickSwitcher };
