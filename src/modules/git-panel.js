/**
 * PinNote - Git panel
 * Set up a vault repository, commit/pull/push/sync, keep folders local-only, and review the
 * commit guard's findings before anything sensitive is committed or pushed.
 */

const CODE_LABELS = { M: 'Modified', A: 'Added', D: 'Deleted', R: 'Renamed', U: 'Conflict', '?': 'New' };

const api = () => window.pinNoteAPI;
const findingKey = (f) => `${f.file}\u0000${f.rule}\u0000${f.excerpt}`;

class GitPanel {
  /**
   * @param {object} options
   * @param {HTMLElement} options.modalEl
   * @param {HTMLElement} options.statusItemEl status-bar button that opens the panel
   * @param {() => string} options.getVaultPath
   * @param {() => Promise<void>} options.beforeGit flush unsaved edits before git reads the vault
   * @param {() => {path: string, relativePath: string}[]} options.getFolders vault folders
   * @param {(status: object) => void} [options.onStatus] called after every status refresh
   */
  constructor({ modalEl, statusItemEl, getVaultPath, beforeGit, getFolders, onStatus }) {
    this.modalEl = modalEl;
    this.statusItemEl = statusItemEl;
    this.getVaultPath = getVaultPath;
    this.beforeGit = beforeGit;
    this.getFolders = getFolders;
    this.onStatus = onStatus;
    this.status = null;
    this.pendingForce = null;
    this.acceptedFindings = new Set();
    this.returnFocusEl = null;

    const $ = (id) => modalEl.querySelector(`#${id}`);
    this.el = {
      subtitle: $('git-subtitle'),
      unavailable: $('git-unavailable'),
      setup: $('git-setup'),
      repo: $('git-repo'),
      name: $('git-name'),
      email: $('git-email'),
      remote: $('git-remote-url'),
      localOnly: $('git-local-only'),
      localOnlyAdd: $('git-local-only-add'),
      changeCount: $('git-change-count'),
      syncState: $('git-sync-state'),
      changes: $('git-changes'),
      message: $('git-commit-message'),
      guard: $('git-guard'),
      guardStage: $('git-guard-stage'),
      guardList: $('git-guard-list'),
      force: $('btn-git-force'),
      rulesToggle: $('git-guard-rules-toggle'),
      rulesEditor: $('git-guard-editor'),
      rules: $('git-guard-rules'),
      rulesErrors: $('git-guard-errors'),
      feedback: $('git-feedback')
    };

    this._bindEvents();
  }

  _bindEvents() {
    const on = (id, handler) => this.modalEl.querySelector(`#${id}`).addEventListener('click', handler);
    on('btn-close-git', () => this.close());
    on('btn-git-init', () => this._run('Initializing…', () => api().gitInit(this.getVaultPath()), 'Git is ready for this vault'));
    on('btn-git-identity', () => this._run('Saving…',
      () => api().gitSetIdentity(this.getVaultPath(), this.el.name.value, this.el.email.value), 'Commit author saved'));
    on('btn-git-remote', () => this._run('Connecting…',
      () => api().gitSetRemote(this.getVaultPath(), this.el.remote.value), 'Remote connected'));
    on('btn-git-commit', () => this.commit());
    on('btn-git-pull', () => this.pull());
    on('btn-git-push', () => this.push());
    on('btn-git-sync', () => this.sync());
    on('btn-git-guard-cancel', () => this._hideGuard());
    on('btn-git-force', () => this.pendingForce?.());
    on('git-guard-rules-toggle', () => this._toggleRules());
    on('btn-git-guard-save', () => this._saveRules());

    this.statusItemEl.addEventListener('click', () => this.open());
    this.modalEl.addEventListener('click', (e) => { if (e.target === this.modalEl) this.close(); });
    this.el.localOnlyAdd.addEventListener('change', () => {
      const folder = this.el.localOnlyAdd.value;
      if (folder) this._setLocalOnly([...(this.status?.localOnly || []), folder]);
    });
    this.el.message.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.commit(); }
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen()) { e.preventDefault(); this.close(); }
    });
  }

  isOpen() {
    return !this.modalEl.classList.contains('hidden');
  }

  async open() {
    this.returnFocusEl = document.activeElement;
    this.modalEl.classList.remove('hidden');
    this._prefilled = false;
    this._feedback('');
    this._hideGuard();
    await this._run('Loading…', async () => {});
    (this.status?.isRepo ? this.el.message : this.modalEl.querySelector('button:not([hidden])'))?.focus();
  }

  close() {
    this.modalEl.classList.add('hidden');
    this.returnFocusEl?.focus?.();
  }

  /** Re-read git status (also used to keep the status bar current) */
  async refresh() {
    try {
      this.status = await api().gitStatus(this.getVaultPath());
    } catch (err) {
      this.status = { available: true, isRepo: false, error: err.message };
    }
    this._renderStatusItem();
    if (this.isOpen()) this._render();
    this.onStatus?.(this.status);
    return this.status;
  }

  // ==========================================
  // Actions
  // ==========================================

  commit(force = false) {
    const message = this.el.message.value;
    return this._run('Committing…', async () => {
      const result = await api().gitCommit(this.getVaultPath(), message, force);
      if (result.blocked) return this._showGuard('commit', result.blocked, () => this.commit(true));
      this.el.message.value = '';
      return result.committed ? `Committed: ${result.message}` : 'Nothing to commit';
    });
  }

  pull() {
    return this._run('Pulling…', async () => {
      const { updated } = await api().gitPull(this.getVaultPath());
      return updated ? 'Pulled new changes from the remote' : 'Already up to date';
    });
  }

  push(force = false) {
    return this._run('Pushing…', async () => {
      const result = await api().gitPush(this.getVaultPath(), force);
      if (result.blocked) return this._showGuard('push', result.blocked, () => this.push(true));
      return 'Pushed to the remote';
    });
  }

  /**
   * Commit, pull and push. Each guard stage is confirmed separately; matches already confirmed
   * at the commit stage are not asked about again when the same lines are pushed.
   */
  sync(options = {}) {
    const message = this.el.message.value;
    if (!options.forceCommit && !options.forcePush) this.acceptedFindings.clear();
    return this._run('Syncing…', async () => {
      let opts = { ...options };
      let result = await api().gitSync(this.getVaultPath(), message, opts);
      // Everything outgoing was already confirmed at the commit stage: push without asking again
      if (result.stage === 'push' && !opts.forcePush &&
        result.blocked.every(f => this.acceptedFindings.has(findingKey(f)))) {
        opts = { ...opts, forcePush: true };
        result = await api().gitSync(this.getVaultPath(), message, opts);
      }
      if (result.blocked) {
        return this._showGuard(result.stage, result.blocked, () => {
          result.blocked.forEach(f => this.acceptedFindings.add(findingKey(f)));
          this.sync({ ...opts, [result.stage === 'commit' ? 'forceCommit' : 'forcePush']: true });
        });
      }
      if (result.committed) this.el.message.value = '';
      const parts = [result.committed ? 'committed' : 'nothing new to commit'];
      if (result.updated) parts.push('pulled new changes');
      if (result.pushed) parts.push('pushed');
      else if (!this.status?.remoteUrl) parts.push('connect a remote to push');
      return `Sync: ${parts.join(' · ')}`;
    });
  }

  _setLocalOnly(folders) {
    return this._run('Updating…', () => api().gitSetLocalOnly(this.getVaultPath(), folders),
      'Local-only folders updated. They stay on this computer and are never committed.');
  }

  /**
   * Run one git action with the panel locked; its return value (or `done`) becomes the feedback
   */
  async _run(busyText, action, done = null) {
    if (this.modalEl.classList.contains('busy')) return;
    this.modalEl.classList.add('busy');
    this.modalEl.querySelectorAll('button, input, select, textarea').forEach(el => { el.disabled = true; });
    this._feedback(busyText);
    try {
      await this.beforeGit?.();
      const result = await action();
      this._feedback(typeof result === 'string' ? result : (done || ''));
    } catch (err) {
      this._feedback(err.message, true);
    } finally {
      await this.refresh();
      this.modalEl.querySelectorAll('button, input, select, textarea').forEach(el => { el.disabled = false; });
      this.modalEl.classList.remove('busy');
    }
  }

  // ==========================================
  // Guard findings
  // ==========================================

  _showGuard(stage, findings, onForce) {
    this.el.guardStage.textContent = stage;
    this.el.force.textContent = stage === 'push' ? 'Push anyway' : 'Commit anyway';
    this.el.guardList.innerHTML = '';
    for (const f of findings.slice(0, 50)) {
      const li = document.createElement('li');
      const where = document.createElement('strong');
      where.textContent = f.line ? `${f.file}:${f.line}` : f.file;
      const rule = document.createElement('code');
      rule.textContent = f.label || f.rule;
      rule.title = f.rule;
      const excerpt = document.createElement('span');
      excerpt.className = 'git-guard-excerpt';
      excerpt.textContent = f.excerpt;
      li.append(where, ' matches ', rule, excerpt);
      this.el.guardList.appendChild(li);
    }
    if (findings.length > 50) {
      const more = document.createElement('li');
      more.textContent = `…and ${findings.length - 50} more`;
      this.el.guardList.appendChild(more);
    }
    this.pendingForce = () => {
      this._hideGuard();
      onForce();
    };
    this.el.guard.hidden = false;
    this.el.guard.scrollIntoView({ block: 'nearest' });
    return `${findings.length} possible sensitive ${findings.length === 1 ? 'item' : 'items'} found — ${stage} stopped`;
  }

  _hideGuard() {
    this.el.guard.hidden = true;
    this.pendingForce = null;
  }

  async _toggleRules() {
    const open = this.el.rulesEditor.hidden;
    this.el.rulesEditor.hidden = !open;
    this.el.rulesToggle.setAttribute('aria-expanded', String(open));
    if (open) {
      this.el.rules.value = await api().gitGuardRead(this.getVaultPath());
      this.el.rulesErrors.textContent = '';
    }
  }

  _saveRules() {
    return this._run('Saving rules…', async () => {
      const errors = await api().gitGuardWrite(this.getVaultPath(), this.el.rules.value);
      this.el.rulesErrors.textContent = errors.length ? `Ignored invalid rules: ${errors.join('; ')}` : '';
      return 'Guard rules saved';
    });
  }

  // ==========================================
  // Rendering
  // ==========================================

  _feedback(text, isError = false) {
    this.el.feedback.textContent = text;
    this.el.feedback.classList.toggle('error', isError);
  }

  _renderStatusItem() {
    const s = this.status;
    const item = this.statusItemEl;
    item.classList.remove('has-changes', 'unavailable');
    if (!s?.available) {
      item.textContent = 'Git unavailable';
      item.classList.add('unavailable');
    } else if (!s.isRepo) {
      item.textContent = 'Set up Git';
    } else {
      const parts = [s.branch || 'main'];
      if (s.changes.length) parts.push(`${s.changes.length} change${s.changes.length === 1 ? '' : 's'}`);
      if (s.ahead) parts.push(`↑${s.ahead}`);
      if (s.behind) parts.push(`↓${s.behind}`);
      item.textContent = parts.join(' · ');
      item.classList.toggle('has-changes', s.changes.length > 0 || s.ahead > 0);
    }
  }

  _render() {
    const s = this.status || {};
    this.el.unavailable.hidden = Boolean(s.available);
    this.el.setup.hidden = !s.available || s.isRepo;
    this.el.repo.hidden = !s.isRepo;
    this.el.subtitle.textContent = s.isRepo
      ? `${s.branch || 'main'}${s.remoteUrl ? ` → ${s.remoteUrl}` : ' · no remote yet'}`
      : this.getVaultPath();
    if (!s.isRepo) return;

    // Prefill settings once per opening so typing is never overwritten by a refresh
    if (!this._prefilled) {
      this.el.name.value = s.identity?.name || '';
      this.el.email.value = s.identity?.email || '';
      this.el.remote.value = s.remoteUrl || '';
      this._prefilled = true;
    }

    this._renderLocalOnly(s.localOnly || []);

    this.el.changeCount.textContent = s.changes.length ? String(s.changes.length) : '';
    const sync = [];
    if (s.ahead) sync.push(`↑${s.ahead} to push`);
    if (s.behind) sync.push(`↓${s.behind} to pull`);
    this.el.syncState.textContent = sync.join(' · ');

    this.el.changes.innerHTML = '';
    if (s.changes.length === 0) {
      const li = document.createElement('li');
      li.className = 'git-change-empty';
      li.textContent = 'No changes — everything is committed';
      this.el.changes.appendChild(li);
    }
    for (const change of s.changes) {
      const li = document.createElement('li');
      li.className = 'git-change';
      const code = document.createElement('span');
      code.className = 'git-change-code';
      code.dataset.code = change.code;
      code.textContent = change.code === '?' ? 'N' : change.code;
      code.title = CODE_LABELS[change.code] || change.code;
      const file = document.createElement('span');
      file.className = 'git-change-path';
      file.textContent = change.path;
      li.append(code, file);
      this.el.changes.appendChild(li);
    }
  }

  _renderLocalOnly(localOnly) {
    const folders = this.getFolders();
    const label = (p) => folders.find(f => f.path === p)?.relativePath.replace(/\\/g, '/') || p;

    this.el.localOnly.innerHTML = '';
    if (localOnly.length === 0) {
      const none = document.createElement('span');
      none.className = 'git-hint';
      none.textContent = 'None — every folder is committed';
      this.el.localOnly.appendChild(none);
    }
    for (const folderPath of localOnly) {
      const chip = document.createElement('span');
      chip.className = 'git-chip';
      chip.textContent = label(folderPath);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'git-chip-remove';
      remove.setAttribute('aria-label', `Commit ${label(folderPath)} again`);
      remove.title = 'Commit this folder again';
      remove.textContent = '×';
      remove.addEventListener('click', () => this._setLocalOnly(localOnly.filter(p => p !== folderPath)));
      chip.appendChild(remove);
      this.el.localOnly.appendChild(chip);
    }

    this.el.localOnlyAdd.innerHTML = '';
    const placeholder = new Option('+ Keep a folder out of Git…', '');
    this.el.localOnlyAdd.appendChild(placeholder);
    for (const folder of folders.filter(f => !localOnly.includes(f.path))) {
      this.el.localOnlyAdd.appendChild(new Option(folder.relativePath.replace(/\\/g, '/'), folder.path));
    }
    this.el.localOnlyAdd.value = '';
  }
}

export { GitPanel };
