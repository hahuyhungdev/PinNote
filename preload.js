const { contextBridge, ipcRenderer } = require('electron');
const { createMarkdownRenderer } = require('./src/lib/markdown');
const { toggleTaskCheckbox, extractTags, flattenNoteFiles, noteTitle, resolveWikiLink } = require('./src/lib/text-utils');

// Rendering happens here, in the isolated preload world, so the page never needs Node access.
// The renderer sanitizes with DOMPurify before HTML ever reaches the page.
const markdownRenderer = createMarkdownRenderer(window);

// Electron prefixes errors from invoke(); strip it so messages are user-presentable
const invoke = async (channel, ...args) => {
  try {
    return await ipcRenderer.invoke(channel, ...args);
  } catch (err) {
    throw new Error(String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
  }
};

// Never hand the ipcRenderer object itself back to the page
const on = (channel, callback) => {
  ipcRenderer.on(channel, (event, ...args) => callback(...args));
};

const api = {
  // Always on top
  toggleAlwaysOnTop: (flag) => invoke('toggle-always-on-top', flag),
  getAlwaysOnTopStatus: () => invoke('get-always-on-top-status'),
  setWindowOpacity: (val) => invoke('set-window-opacity', val),

  // Window actions
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  onMaximizedState: (callback) => on('window-maximized-state', callback),
  onBeforeClose: (callback) => on('app-before-close', callback),
  readyToClose: () => ipcRenderer.send('ready-to-close'),

  // Vault & File management
  getDefaultVaultDir: () => invoke('get-default-vault-dir'),
  getCurrentVault: (legacyPath) => invoke('get-current-vault', legacyPath),
  selectVaultFolder: () => invoke('select-vault-folder'),
  readVaultTree: (path) => invoke('read-vault-tree', path),
  findNotesWithTag: (vaultPath, tag) => invoke('find-notes-with-tag', vaultPath, tag),
  readFileContent: (path) => invoke('read-file-content', path),
  saveFileContent: (path, content) => invoke('save-file-content', path, content),
  createNewNote: (vaultPath, filename) => invoke('create-new-note', vaultPath, filename),
  getDefaultNoteName: () => invoke('get-default-note-name'),
  deleteFile: (path) => invoke('delete-file', path),
  renameFile: (oldPath, newName) => invoke('rename-file', oldPath, newName),
  openDetachedNoteWindow: (filePath) => invoke('open-detached-note-window', filePath),

  // Note Revision History
  saveNoteSnapshot: (filePath, content, force) => invoke('save-note-snapshot', filePath, content, force),
  getNoteHistory: (filePath) => invoke('get-note-history', filePath),
  restoreNoteSnapshot: (filePath, snapshotId) => invoke('restore-note-snapshot', filePath, snapshotId),

  // Cross-window event listeners
  onFileSavedExternally: (callback) => on('file-saved-externally', callback),
  onFileRenamedExternally: (callback) => on('file-renamed-externally', callback),
  onFileDeletedExternally: (callback) => on('file-deleted-externally', callback),
  onVaultTreeChanged: (callback) => on('vault-tree-changed', callback)
};

const markdown = {
  render: (raw) => markdownRenderer.render(String(raw ?? '')),
  toggleTaskCheckbox: (text, index, checked) => toggleTaskCheckbox(String(text), index, checked),
  extractTags: (text) => extractTags(String(text ?? '')),
  flattenNoteFiles: (items) => flattenNoteFiles(items),
  noteTitle: (name) => noteTitle(name),
  resolveWikiLink: (files, link) => resolveWikiLink(files, link)
};

contextBridge.exposeInMainWorld('pinNoteAPI', api);
contextBridge.exposeInMainWorld('pinNoteMarkdown', markdown);
