const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { extractTags, flattenNoteFiles, sanitizeNoteName, isPathInside } = require('./src/lib/text-utils');

function logDebug(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    fs.appendFileSync(path.join(app.getPath('userData'), 'launch-debug.log'), line);
  } catch (e) {}
  console.log(msg);
}

process.on('uncaughtException', (err) => {
  logDebug(`UNCAUGHT EXCEPTION: ${err.stack || err}`);
});
process.on('unhandledRejection', (reason) => {
  logDebug(`UNHANDLED REJECTION: ${reason}`);
});

let mainWindow = null;
const detachedWindows = new Map();
const flushedWindows = new WeakSet();
const allowedRoots = new Set();

const IS_WINDOWS = process.platform === 'win32';
const samePath = (a, b) => IS_WINDOWS
  ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase()
  : path.resolve(a) === path.resolve(b);

logDebug(`Starting PinNote process PID: ${process.pid}`);

// Single instance lock
let gotTheLock = false;
try {
  gotTheLock = app.requestSingleInstanceLock();
} catch (err) {
  logDebug(`requestSingleInstanceLock exception: ${err}`);
  gotTheLock = true;
}

if (!gotTheLock) {
  logDebug('Single instance lock denied. Calling app.quit()');
  app.quit();
} else {
  app.on('second-instance', () => {
    // Sticky notes keep the process alive after the main window closes; relaunching brings it back
    if (!mainWindow) {
      if (app.isReady()) createMainWindow();
    } else {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.setAlwaysOnTop(true);
      mainWindow.focus();
      mainWindow.setAlwaysOnTop(false);
    }
  });
}

// ==========================================
// WINDOW SECURITY
// ==========================================

const SECURE_WEB_PREFERENCES = {
  preload: path.join(__dirname, 'preload.js'),
  contextIsolation: true,
  nodeIntegration: false,
  // The preload needs require() for marked/katex/DOMPurify; the page itself has no Node access
  sandbox: false,
  webSecurity: true
};

function openExternalSafe(url) {
  try {
    const { protocol } = new URL(url);
    if (['http:', 'https:', 'mailto:'].includes(protocol)) shell.openExternal(url);
  } catch (e) {}
}

function hardenWindow(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafe(url);
    return { action: 'deny' };
  });

  // Clicking a link in the preview must never navigate the app window away
  win.webContents.on('will-navigate', (event, url) => {
    event.preventDefault();
    openExternalSafe(url);
  });

  win.on('maximize', () => win.webContents.send('window-maximized-state', true));
  win.on('unmaximize', () => win.webContents.send('window-maximized-state', false));

  // Give the renderer a chance to flush pending edits before the window closes
  win.on('close', (event) => {
    if (flushedWindows.has(win) || win.webContents.isDestroyed()) return;
    event.preventDefault();
    win.webContents.send('app-before-close');
    setTimeout(() => closeWithoutFlush(win), 2000);
  });
}

function closeWithoutFlush(win) {
  if (!win || win.isDestroyed()) return;
  flushedWindows.add(win);
  win.close();
}

ipcMain.on('ready-to-close', (event) => {
  closeWithoutFlush(BrowserWindow.fromWebContents(event.sender));
});

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 800,
    minWidth: 560,
    minHeight: 420,
    frame: false,
    backgroundColor: '#fcfbf9',
    titleBarStyle: 'hidden',
    show: false,
    webPreferences: SECURE_WEB_PREFERENCES
  });

  hardenWindow(mainWindow);
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    logDebug(`mainWindow render-process-gone: ${JSON.stringify(details)}`);
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    logDebug(`mainWindow did-fail-load: ${errorCode} - ${errorDescription}`);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ==========================================
// IPC HANDLERS
// ==========================================

// 📌 Always On Top Handler (Exclusively for individual note windows)
ipcMain.handle('toggle-always-on-top', (event, flag) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win === mainWindow) return false;

  const targetState = typeof flag === 'boolean' ? flag : !win.isAlwaysOnTop();
  win.setAlwaysOnTop(targetState, 'screen-saver');
  return targetState;
});

ipcMain.handle('get-always-on-top-status', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win === mainWindow) return false;
  return win.isAlwaysOnTop();
});

// 👻 Window Opacity Control
ipcMain.handle('set-window-opacity', (event, opacityVal) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return 1.0;
  const val = Math.max(0.2, Math.min(1.0, parseFloat(opacityVal) || 1.0));
  win.setOpacity(val);
  return val;
});

// Window controls (minimize, maximize/restore, close)
ipcMain.on('window-minimize', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});

ipcMain.on('window-maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});

ipcMain.on('window-close', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});

// ==========================================
// VAULT & FILE SYSTEM OPERATIONS
// ==========================================

function allowRoot(dir) {
  allowedRoots.add(path.resolve(dir));
}

const isAllowedRoot = (dir) => [...allowedRoots].some(root => samePath(root, dir));

// Resolve symlinks/junctions on the longest existing prefix so links cannot escape the vault
function realpathLoose(p) {
  let current = path.resolve(p);
  const tail = [];
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) break;
    tail.unshift(path.basename(current));
    current = parent;
  }
  try {
    return path.join(fs.realpathSync.native(current), ...tail);
  } catch (e) {
    return path.join(current, ...tail);
  }
}

function assertInVault(filePath) {
  if (typeof filePath !== 'string') throw new Error('Invalid path');
  const resolved = path.resolve(filePath);
  if (!/\.(md|txt)$/i.test(resolved) || resolved.split(/[\\/]/).includes('.pinnote')) {
    throw new Error('Only .md and .txt notes can be accessed');
  }
  const real = realpathLoose(resolved);
  const inside = [...allowedRoots].some(root => isPathInside(resolved, root) && isPathInside(real, realpathLoose(root)));
  if (!inside) throw new Error('Path is outside the open vault');
  return resolved;
}

// ==========================================
// SETTINGS (main-owned; the page cannot widen the allowed vault roots)
// ==========================================

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(), 'utf-8')) || {};
  } catch (e) {
    return {};
  }
}

function writeSettings(patch) {
  try {
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
    fs.writeFileSync(settingsFile(), JSON.stringify({ ...readSettings(), ...patch }, null, 2), 'utf-8');
  } catch (e) {
    logDebug(`Settings write failed: ${e}`);
  }
}

const isDirectory = (dir) => {
  try {
    return typeof dir === 'string' && fs.statSync(dir).isDirectory();
  } catch (e) {
    return false;
  }
};

function getConfiguredVault() {
  const { vaultPath } = readSettings();
  if (isDirectory(vaultPath)) {
    allowRoot(vaultPath);
    return path.resolve(vaultPath);
  }
  return getDefaultVaultDir();
}

function broadcast(channel, ...args) {
  BrowserWindow.getAllWindows().forEach(win => {
    if (!win.isDestroyed()) win.webContents.send(channel, ...args);
  });
}

const getDefaultVaultDir = () => {
  const defaultVault = path.join(app.getPath('documents'), 'PinNote Vault');
  if (!fs.existsSync(defaultVault)) {
    fs.mkdirSync(defaultVault, { recursive: true });
  }

  // Copy sample starter notes if vault is brand new and empty
  try {
    const sampleVault = path.join(__dirname, 'sample-vault');
    if (fs.existsSync(sampleVault) && fs.readdirSync(defaultVault).length === 0) {
      for (const file of fs.readdirSync(sampleVault)) {
        fs.copyFileSync(path.join(sampleVault, file), path.join(defaultVault, file));
      }
    }
  } catch (e) {
    logDebug(`Sample notes copy error: ${e}`);
  }

  allowRoot(defaultVault);
  return defaultVault;
};

ipcMain.handle('get-default-vault-dir', () => getDefaultVaultDir());

// One-time migration of the vault path older versions kept in renderer localStorage.
// Only honoured on the first call of the process, before any note content has rendered.
let legacyMigrationOpen = true;
ipcMain.handle('get-current-vault', (event, legacyPath) => {
  if (legacyMigrationOpen) {
    legacyMigrationOpen = false;
    if (!readSettings().vaultPath && isDirectory(legacyPath)) writeSettings({ vaultPath: path.resolve(legacyPath) });
  }
  return getConfiguredVault();
});

ipcMain.handle('select-vault-folder', async (event) => {
  const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select Markdown Vault Folder'
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const chosen = path.resolve(result.filePaths[0]);
  allowRoot(chosen);
  writeSettings({ vaultPath: chosen });
  return chosen;
});

// Fast recursive scanner for Markdown notes (.md & .txt)
function scanDirectory(dirPath, rootPath = dirPath, depth = 0) {
  if (depth > 5) return []; // Guard against deeply nested structures
  const results = [];
  try {
    const list = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const item of list) {
      if (item.name.startsWith('.')) continue; // Skip hidden dirs (.git, .obsidian, .pinnote)
      const fullPath = path.join(dirPath, item.name);
      const relativePath = path.relative(rootPath, fullPath);

      if (item.isDirectory()) {
        results.push({
          name: item.name,
          path: fullPath,
          relativePath,
          type: 'directory',
          children: scanDirectory(fullPath, rootPath, depth + 1)
        });
      } else if (item.isFile() && /\.(md|txt)$/i.test(item.name)) {
        const stats = fs.statSync(fullPath);
        results.push({
          name: item.name,
          path: fullPath,
          relativePath,
          type: 'file',
          mtime: stats.mtimeMs,
          size: stats.size
        });
      }
    }
  } catch (err) {
    logDebug(`Error scanning dir: ${err}`);
  }
  return results;
}

// Only vaults main already trusts (default, configured, or picked in the dialog) are accepted
function resolveVault(vaultPath) {
  if (isDirectory(vaultPath) && isAllowedRoot(vaultPath)) return path.resolve(vaultPath);
  return getConfiguredVault();
}

ipcMain.handle('read-vault-tree', (event, vaultPath) => {
  const targetDir = resolveVault(vaultPath);
  return { vaultPath: targetDir, items: scanDirectory(targetDir) };
});

ipcMain.handle('find-notes-with-tag', (event, vaultPath, tag) => {
  const targetDir = resolveVault(vaultPath);
  const wanted = String(tag || '').toLowerCase();
  if (!wanted.startsWith('#') || wanted.length < 2) return [];

  return flattenNoteFiles(scanDirectory(targetDir))
    .filter(file => {
      try {
        const content = fs.readFileSync(file.path, 'utf-8');
        return extractTags(content).some(t => t.toLowerCase() === wanted);
      } catch (e) {
        return false;
      }
    })
    .map(file => file.path);
});

ipcMain.handle('read-file-content', (event, filePath) => {
  const safePath = assertInVault(filePath);
  if (!fs.existsSync(safePath)) return null;
  return fs.readFileSync(safePath, 'utf-8');
});

ipcMain.handle('save-file-content', (event, filePath, content) => {
  const safePath = assertInVault(filePath);
  if (typeof content !== 'string') throw new Error('Content must be a string');
  // Never re-create a note that was renamed or deleted while a save was pending
  if (!fs.existsSync(safePath)) throw new Error('This note no longer exists');

  fs.writeFileSync(safePath, content, 'utf-8');

  // Broadcast update to other open windows (live sync)
  BrowserWindow.getAllWindows().forEach(win => {
    if (!win.isDestroyed() && win.webContents.id !== event.sender.id) {
      win.webContents.send('file-saved-externally', filePath, content);
    }
  });
  return true;
});

function getDefaultNoteName() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${day}-${month}.md`;
}

function historyHash(filePath) {
  return crypto.createHash('md5').update(path.resolve(filePath).toLowerCase()).digest('hex');
}

// Directories are only created when writing, so viewing a note leaves no .pinnote folder behind
function getNoteHistoryFilePath(filePath, { create = false } = {}) {
  const name = `${historyHash(filePath)}.json`;
  const vaultDir = path.join(path.dirname(filePath), '.pinnote', 'history');
  const fallbackDir = path.join(app.getPath('userData'), 'note-history');

  if (!create) {
    const fallback = path.join(fallbackDir, name);
    return !fs.existsSync(path.join(vaultDir, name)) && fs.existsSync(fallback) ? fallback : path.join(vaultDir, name);
  }
  try {
    fs.mkdirSync(vaultDir, { recursive: true });
    return path.join(vaultDir, name);
  } catch (err) {
    fs.mkdirSync(fallbackDir, { recursive: true });
    return path.join(fallbackDir, name);
  }
}

function makeSnapshot(content, extra = {}) {
  const now = Date.now();
  return {
    id: `snap_${now}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: now,
    timeStr: new Date(now).toLocaleString(),
    words: content.trim() ? content.trim().split(/\s+/).length : 0,
    chars: content.length,
    lines: content.split('\n').length,
    preview: content.trim().slice(0, 150),
    content,
    ...extra
  };
}

function readHistory(historyFile, filePath) {
  try {
    const data = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
    if (!Array.isArray(data.snapshots)) data.snapshots = [];
    return data;
  } catch (e) {
    return { filePath, snapshots: [] };
  }
}

ipcMain.handle('get-default-note-name', () => getDefaultNoteName());

ipcMain.handle('create-new-note', (event, vaultPath, filename = null) => {
  const targetVault = resolveVault(vaultPath);
  let baseName = sanitizeNoteName(String(filename || '').replace(/\.md$/i, ''));
  if (!baseName || baseName === 'Untitled') baseName = getDefaultNoteName().replace(/\.md$/, '');

  let safeName = `${baseName}.md`;
  let filePath = path.join(targetVault, safeName);
  let counter = 1;
  while (fs.existsSync(filePath)) {
    safeName = `${baseName} ${counter}.md`;
    filePath = path.join(targetVault, safeName);
    counter++;
  }
  assertInVault(filePath);

  const initialContent = `# ${baseName}\n\nStart typing your note here... #notes\n\n- [ ] Task 1\n- [ ] Task 2\n`;
  fs.writeFileSync(filePath, initialContent, 'utf-8');

  // Create initial history checkpoint
  try {
    const snap = makeSnapshot(initialContent, { id: `snap_${Date.now()}_init`, tag: 'Created' });
    fs.writeFileSync(getNoteHistoryFilePath(filePath, { create: true }), JSON.stringify({ filePath, snapshots: [snap] }, null, 2), 'utf-8');
  } catch (e) {}

  broadcast('vault-tree-changed');
  return { filePath, name: safeName };
});

ipcMain.handle('save-note-snapshot', (event, filePath, content, force = false) => {
  try {
    if (!filePath || typeof content !== 'string') return false;
    if (!fs.existsSync(assertInVault(filePath))) return false;
    const historyFile = getNoteHistoryFilePath(filePath, { create: true });
    const historyData = readHistory(historyFile, filePath);
    const lastSnap = historyData.snapshots[historyData.snapshots.length - 1];

    // Skip duplicate content
    if (lastSnap && lastSnap.content === content) return false;

    // Unless forced, throttle to 30s or minimum 20 chars difference
    if (!force && lastSnap) {
      const elapsed = Date.now() - lastSnap.timestamp;
      const charDiff = Math.abs((lastSnap.content?.length || 0) - content.length);
      if (elapsed < 30000 && charDiff < 20) return false;
    }

    historyData.snapshots.push(makeSnapshot(content));
    // Keep up to 50 snapshots
    historyData.snapshots = historyData.snapshots.slice(-50);

    fs.writeFileSync(historyFile, JSON.stringify(historyData, null, 2), 'utf-8');
    return true;
  } catch (err) {
    logDebug(`Failed to save snapshot: ${err}`);
    return false;
  }
});

ipcMain.handle('get-note-history', (event, filePath) => {
  try {
    if (!filePath) return [];
    assertInVault(filePath);
    const historyFile = getNoteHistoryFilePath(filePath);
    if (!fs.existsSync(historyFile)) return [];
    // Return newest first
    return [...readHistory(historyFile, filePath).snapshots].reverse();
  } catch (err) {
    logDebug(`Failed to get note history: ${err}`);
    return [];
  }
});

ipcMain.handle('restore-note-snapshot', (event, filePath, snapshotId) => {
  if (!filePath || !snapshotId) throw new Error('Missing filePath or snapshotId');
  const safePath = assertInVault(filePath);
  const historyFile = getNoteHistoryFilePath(safePath);
  if (!fs.existsSync(historyFile)) throw new Error('No history found for note');

  const historyData = readHistory(historyFile, safePath);
  const targetSnap = historyData.snapshots.find(s => s.id === snapshotId);
  if (!targetSnap) throw new Error('Snapshot not found');

  // Backup current content before restoring so restoration can be undone
  if (fs.existsSync(safePath)) {
    const currentContent = fs.readFileSync(safePath, 'utf-8');
    if (currentContent !== targetSnap.content) {
      historyData.snapshots.push(makeSnapshot(currentContent, { id: `snap_${Date.now()}_pre_restore`, tag: 'Before restore' }));
    }
  }

  fs.writeFileSync(safePath, targetSnap.content, 'utf-8');
  fs.writeFileSync(historyFile, JSON.stringify(historyData, null, 2), 'utf-8');

  broadcast('file-saved-externally', filePath, targetSnap.content);
  return { success: true, content: targetSnap.content };
});

ipcMain.handle('delete-file', (event, filePath) => {
  const safePath = assertInVault(filePath);
  if (fs.existsSync(safePath)) fs.unlinkSync(safePath);

  // Clean up history file if exists
  try {
    const histFile = getNoteHistoryFilePath(safePath);
    if (fs.existsSync(histFile)) fs.unlinkSync(histFile);
  } catch (e) {}

  const sticky = detachedWindows.get(filePath);
  if (sticky && !sticky.isDestroyed()) {
    // Skip the flush handshake: flushing would re-create the deleted file
    closeWithoutFlush(sticky);
  }
  detachedWindows.delete(filePath);

  broadcast('file-deleted-externally', filePath);
  broadcast('vault-tree-changed');
  return true;
});

ipcMain.handle('rename-file', (event, oldPath, newName) => {
  const safeOld = assertInVault(oldPath);
  const ext = path.extname(safeOld) || '.md';
  const baseName = sanitizeNoteName(String(newName || '').replace(/\.(md|txt)$/i, ''));
  if (!baseName) throw new Error('Please enter a valid note name');

  const newPath = path.join(path.dirname(safeOld), `${baseName}${ext}`);
  assertInVault(newPath);

  if (newPath === safeOld) return newPath;
  // Windows renameSync silently replaces an existing file; refuse unless it is a case-only rename
  if (!samePath(newPath, safeOld) && fs.existsSync(newPath)) {
    throw new Error(`A note named "${baseName}${ext}" already exists`);
  }

  fs.renameSync(safeOld, newPath);

  // Carry revision history over to the new file name
  try {
    const oldHist = getNoteHistoryFilePath(safeOld);
    const newHist = getNoteHistoryFilePath(newPath, { create: true });
    if (oldHist !== newHist && fs.existsSync(oldHist)) {
      const data = readHistory(oldHist, newPath);
      data.filePath = newPath;
      fs.writeFileSync(newHist, JSON.stringify(data, null, 2), 'utf-8');
      fs.unlinkSync(oldHist);
    }
  } catch (e) {
    logDebug(`History move failed: ${e}`);
  }

  if (detachedWindows.has(oldPath)) {
    detachedWindows.set(newPath, detachedWindows.get(oldPath));
    detachedWindows.delete(oldPath);
  }

  broadcast('file-renamed-externally', oldPath, newPath);
  broadcast('vault-tree-changed');
  return newPath;
});

// ==========================================
// 📌 STANDALONE FLOATING DESKTOP STICKY NOTES
// ==========================================

ipcMain.handle('open-detached-note-window', (event, filePath) => {
  assertInVault(filePath);

  const existingWin = detachedWindows.get(filePath);
  if (existingWin && !existingWin.isDestroyed()) {
    existingWin.show();
    existingWin.focus();
    return true;
  }

  const stickyWin = new BrowserWindow({
    width: 480,
    height: 560,
    minWidth: 320,
    minHeight: 240,
    frame: false,
    alwaysOnTop: true, // Each individual sticky note floats on top!
    backgroundColor: '#f7f4ee',
    titleBarStyle: 'hidden',
    webPreferences: SECURE_WEB_PREFERENCES
  });

  stickyWin.setAlwaysOnTop(true, 'screen-saver');
  hardenWindow(stickyWin);
  stickyWin.loadFile(path.join(__dirname, 'src', 'sticky.html'), { query: { filePath } });

  detachedWindows.set(filePath, stickyWin);

  stickyWin.on('closed', () => {
    for (const [key, win] of detachedWindows) {
      if (win === stickyWin) detachedWindows.delete(key);
    }
  });

  return true;
});
