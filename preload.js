const { contextBridge, ipcRenderer } = require('electron');

const api = {
  // Always on top
  toggleAlwaysOnTop: (flag) => ipcRenderer.invoke('toggle-always-on-top', flag),
  getAlwaysOnTopStatus: () => ipcRenderer.invoke('get-always-on-top-status'),
  setWindowOpacity: (val) => ipcRenderer.invoke('set-window-opacity', val),

  // Window actions
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  onMaximizedState: (callback) => ipcRenderer.on('window-maximized-state', (event, state) => callback(state)),

  // Vault & File management
  getDefaultVaultDir: () => ipcRenderer.invoke('get-default-vault-dir'),
  selectVaultFolder: () => ipcRenderer.invoke('select-vault-folder'),
  readVaultTree: (path) => ipcRenderer.invoke('read-vault-tree', path),
  readFileContent: (path) => ipcRenderer.invoke('read-file-content', path),
  saveFileContent: (path, content) => ipcRenderer.invoke('save-file-content', path, content),
  createNewNote: (vaultPath, filename) => ipcRenderer.invoke('create-new-note', vaultPath, filename),
  getDefaultNoteName: () => ipcRenderer.invoke('get-default-note-name'),
  deleteFile: (path) => ipcRenderer.invoke('delete-file', path),
  renameFile: (oldPath, newName) => ipcRenderer.invoke('rename-file', oldPath, newName),
  openDetachedNoteWindow: (filePath) => ipcRenderer.invoke('open-detached-note-window', filePath),

  // Note Revision History
  saveNoteSnapshot: (filePath, content, force) => ipcRenderer.invoke('save-note-snapshot', filePath, content, force),
  getNoteHistory: (filePath) => ipcRenderer.invoke('get-note-history', filePath),
  restoreNoteSnapshot: (filePath, snapshotId) => ipcRenderer.invoke('restore-note-snapshot', filePath, snapshotId),

  // Cross-window event listeners
  onFileSavedExternally: (callback) => ipcRenderer.on('file-saved-externally', (event, filePath, content) => callback(filePath, content)),
  onFileRenamedExternally: (callback) => ipcRenderer.on('file-renamed-externally', (event, oldPath, newPath) => callback(oldPath, newPath)),
  onFileDeletedExternally: (callback) => ipcRenderer.on('file-deleted-externally', (event, filePath) => callback(filePath)),
  onVaultTreeChanged: (callback) => ipcRenderer.on('vault-tree-changed', () => callback())
};

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('pinNoteAPI', api);
} else {
  window.pinNoteAPI = api;
}
