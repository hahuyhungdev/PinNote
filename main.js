const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs-extra') || require('fs');
const crypto = require('crypto');

let mainWindow = null;
const detachedWindows = new Map();

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 420,
    minHeight: 400,
    frame: false,
    transparent: false,
    backgroundColor: '#fcfbf9',
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-maximized-state', true);
  });

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-maximized-state', false);
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
  // Main app window does NOT use pin-on-top; only individual note windows
  if (!win || win === mainWindow) return false;

  let targetState = typeof flag === 'boolean' ? flag : !win.isAlwaysOnTop();
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
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (!win) return 1.0;
  const val = Math.max(0.2, Math.min(1.0, parseFloat(opacityVal) || 1.0));
  win.setOpacity(val);
  return val;
});

// Window controls (minimize, maximize/restore, close)
ipcMain.on('window-minimize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  win?.minimize();
});

ipcMain.on('window-maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (!win) return;
  if (win.isMaximized()) {
    win.unmaximize();
  } else {
    win.maximize();
  }
});

ipcMain.on('window-close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  win?.close();
});

// ==========================================
// VAULT & FILE SYSTEM OPERATIONS
// ==========================================

const getDefaultVaultDir = () => {
  const documentsDir = app.getPath('documents');
  const defaultVault = path.join(documentsDir, 'PinNote Vault');
  if (!fs.existsSync(defaultVault)) {
    fs.mkdirSync(defaultVault, { recursive: true });
  }

  // Copy sample starter notes if vault is brand new and empty
  try {
    const sampleVault = path.join(__dirname, 'sample-vault');
    if (fs.existsSync(sampleVault)) {
      const existing = fs.readdirSync(defaultVault);
      if (existing.length === 0) {
        const sampleFiles = fs.readdirSync(sampleVault);
        for (const file of sampleFiles) {
          fs.copyFileSync(path.join(sampleVault, file), path.join(defaultVault, file));
        }
      }
    }
  } catch (e) {
    console.error('Sample notes copy error:', e);
  }

  return defaultVault;
};

ipcMain.handle('get-default-vault-dir', () => {
  return getDefaultVaultDir();
});

ipcMain.handle('select-vault-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select Markdown Vault Folder'
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// Fast recursive scanner for Markdown notes (.md & .txt)
function scanDirectory(dirPath, rootPath = dirPath, depth = 0) {
  if (depth > 5) return []; // Guard against deeply nested structures
  let results = [];
  try {
    const list = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const item of list) {
      if (item.name.startsWith('.')) continue; // Skip hidden dirs (.git, .obsidian)
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
      } else if (item.isFile() && (item.name.endsWith('.md') || item.name.endsWith('.txt'))) {
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
    console.error('Error scanning dir:', err);
  }
  return results;
}

ipcMain.handle('read-vault-tree', (event, vaultPath) => {
  const targetDir = (vaultPath && typeof vaultPath === 'string' && fs.existsSync(vaultPath))
    ? vaultPath
    : getDefaultVaultDir();

  return {
    vaultPath: targetDir,
    items: scanDirectory(targetDir)
  };
});

ipcMain.handle('read-file-content', (event, filePath) => {
  try {
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    console.error('Failed to read file:', err);
    throw err;
  }
});

ipcMain.handle('save-file-content', (event, filePath, content) => {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, content, 'utf-8');

    // Broadcast update to other open windows (live sync)
    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed() && win.webContents.id !== event.sender.id) {
        win.webContents.send('file-saved-externally', filePath, content);
      }
    });

    return true;
  } catch (err) {
    console.error('Failed to save file:', err);
    throw err;
  }
});

function getDefaultNoteName() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${day}-${month}.md`;
}

function getNoteHistoryFilePath(filePath) {
  try {
    const dir = path.dirname(filePath);
    const histDir = path.join(dir, '.pinnote', 'history');
    if (!fs.existsSync(histDir)) {
      fs.mkdirSync(histDir, { recursive: true });
    }
    const hash = crypto.createHash('md5').update(path.resolve(filePath).toLowerCase()).digest('hex');
    return path.join(histDir, `${hash}.json`);
  } catch (err) {
    const fallbackDir = path.join(app.getPath('userData'), 'note-history');
    if (!fs.existsSync(fallbackDir)) fs.mkdirSync(fallbackDir, { recursive: true });
    const hash = crypto.createHash('md5').update(path.resolve(filePath).toLowerCase()).digest('hex');
    return path.join(fallbackDir, `${hash}.json`);
  }
}

ipcMain.handle('get-default-note-name', () => {
  return getDefaultNoteName();
});

ipcMain.handle('create-new-note', (event, vaultPath, filename = null) => {
  try {
    const targetVault = vaultPath || getDefaultVaultDir();
    let safeName = filename;
    if (!safeName || safeName === 'Untitled.md' || safeName.trim() === '') {
      safeName = getDefaultNoteName();
    } else if (!safeName.endsWith('.md')) {
      safeName = `${safeName}.md`;
    }

    let filePath = path.join(targetVault, safeName);

    let counter = 1;
    const nameWithoutExt = safeName.replace(/\.md$/, '');
    while (fs.existsSync(filePath)) {
      safeName = `${nameWithoutExt} ${counter}.md`;
      filePath = path.join(targetVault, safeName);
      counter++;
    }

    const initialContent = `# ${safeName.replace(/\.md$/, '')}\n\nStart typing your note here... #notes\n\n- [ ] Task 1\n- [ ] Task 2\n`;
    fs.writeFileSync(filePath, initialContent, 'utf-8');

    // Create initial history checkpoint
    try {
      const historyFile = getNoteHistoryFilePath(filePath);
      const now = Date.now();
      const initialSnap = {
        id: `snap_${now}_init`,
        timestamp: now,
        timeStr: new Date(now).toLocaleString(),
        words: initialContent.trim().split(/\s+/).length,
        chars: initialContent.length,
        lines: initialContent.split('\n').length,
        preview: initialContent.trim().slice(0, 150),
        content: initialContent,
        tag: 'Created'
      };
      fs.writeFileSync(historyFile, JSON.stringify({ filePath, snapshots: [initialSnap] }, null, 2), 'utf-8');
    } catch (e) {}

    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send('vault-tree-changed');
      }
    });

    return { filePath, name: safeName };
  } catch (err) {
    console.error('Failed to create note:', err);
    throw err;
  }
});

ipcMain.handle('save-note-snapshot', (event, filePath, content, force = false) => {
  try {
    if (!filePath || typeof content !== 'string') return false;
    const historyFile = getNoteHistoryFilePath(filePath);

    let historyData = { filePath, snapshots: [] };
    if (fs.existsSync(historyFile)) {
      try {
        historyData = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
        if (!Array.isArray(historyData.snapshots)) historyData.snapshots = [];
      } catch (e) {
        historyData = { filePath, snapshots: [] };
      }
    }

    const now = Date.now();
    const lastSnap = historyData.snapshots[historyData.snapshots.length - 1];

    // Skip duplicate content
    if (lastSnap && lastSnap.content === content) {
      return false;
    }

    // Unless forced, throttle to 30s or minimum 20 chars difference
    if (!force && lastSnap) {
      const elapsed = now - lastSnap.timestamp;
      const charDiff = Math.abs((lastSnap.content?.length || 0) - content.length);
      if (elapsed < 30000 && charDiff < 20) {
        return false;
      }
    }

    const words = content.trim() ? content.trim().split(/\s+/).length : 0;
    const snap = {
      id: `snap_${now}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: now,
      timeStr: new Date(now).toLocaleString(),
      words,
      chars: content.length,
      lines: content.split('\n').length,
      preview: content.trim().slice(0, 150),
      content
    };

    historyData.snapshots.push(snap);

    // Keep up to 50 snapshots
    if (historyData.snapshots.length > 50) {
      historyData.snapshots = historyData.snapshots.slice(-50);
    }

    fs.writeFileSync(historyFile, JSON.stringify(historyData, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Failed to save snapshot:', err);
    return false;
  }
});

ipcMain.handle('get-note-history', (event, filePath) => {
  try {
    if (!filePath) return [];
    const historyFile = getNoteHistoryFilePath(filePath);
    if (!fs.existsSync(historyFile)) return [];

    const historyData = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
    if (!Array.isArray(historyData.snapshots)) return [];

    // Return newest first
    return [...historyData.snapshots].reverse();
  } catch (err) {
    console.error('Failed to get note history:', err);
    return [];
  }
});

ipcMain.handle('restore-note-snapshot', (event, filePath, snapshotId) => {
  try {
    if (!filePath || !snapshotId) throw new Error('Missing filePath or snapshotId');
    const historyFile = getNoteHistoryFilePath(filePath);
    if (!fs.existsSync(historyFile)) throw new Error('No history found for note');

    const historyData = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
    const targetSnap = (historyData.snapshots || []).find(s => s.id === snapshotId);
    if (!targetSnap) throw new Error('Snapshot not found');

    // Backup current content before restoring so restoration can be undone
    if (fs.existsSync(filePath)) {
      const currentContent = fs.readFileSync(filePath, 'utf-8');
      if (currentContent !== targetSnap.content) {
        const now = Date.now();
        const words = currentContent.trim() ? currentContent.trim().split(/\s+/).length : 0;
        historyData.snapshots.push({
          id: `snap_${now}_pre_restore`,
          timestamp: now,
          timeStr: new Date(now).toLocaleString(),
          words,
          chars: currentContent.length,
          lines: currentContent.split('\n').length,
          preview: currentContent.trim().slice(0, 150),
          content: currentContent,
          tag: 'Before restore'
        });
      }
    }

    // Write restored content
    fs.writeFileSync(filePath, targetSnap.content, 'utf-8');
    fs.writeFileSync(historyFile, JSON.stringify(historyData, null, 2), 'utf-8');

    // Broadcast live sync
    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send('file-saved-externally', filePath, targetSnap.content);
      }
    });

    return { success: true, content: targetSnap.content };
  } catch (err) {
    console.error('Failed to restore snapshot:', err);
    throw err;
  }
});

ipcMain.handle('delete-file', (event, filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Clean up history file if exists
    try {
      const histFile = getNoteHistoryFilePath(filePath);
      if (fs.existsSync(histFile)) fs.unlinkSync(histFile);
    } catch (e) {}

    if (detachedWindows.has(filePath)) {
      const win = detachedWindows.get(filePath);
      if (win && !win.isDestroyed()) {
        win.close();
      }
      detachedWindows.delete(filePath);
    }

    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send('file-deleted-externally', filePath);
        win.webContents.send('vault-tree-changed');
      }
    });

    return true;
  } catch (err) {
    console.error('Failed to delete file:', err);
    throw err;
  }
});

ipcMain.handle('rename-file', (event, oldPath, newName) => {
  try {
    const dir = path.dirname(oldPath);
    let safeName = newName.trim();
    if (!safeName.endsWith('.md')) safeName += '.md';
    const newPath = path.join(dir, safeName);

    if (oldPath !== newPath) {
      fs.renameSync(oldPath, newPath);
    }

    if (detachedWindows.has(oldPath)) {
      const win = detachedWindows.get(oldPath);
      detachedWindows.delete(oldPath);
      detachedWindows.set(newPath, win);
    }

    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send('file-renamed-externally', oldPath, newPath);
        win.webContents.send('vault-tree-changed');
      }
    });

    return newPath;
  } catch (err) {
    console.error('Failed to rename file:', err);
    throw err;
  }
});

// ==========================================
// 📌 STANDALONE FLOATING DESKTOP STICKY NOTES
// ==========================================

ipcMain.handle('open-detached-note-window', (event, filePath) => {
  if (detachedWindows.has(filePath)) {
    const existingWin = detachedWindows.get(filePath);
    if (!existingWin.isDestroyed()) {
      existingWin.show();
      existingWin.focus();
      return true;
    }
  }

  const stickyWin = new BrowserWindow({
    width: 440,
    height: 520,
    minWidth: 280,
    minHeight: 220,
    frame: false,
    alwaysOnTop: true, // Each individual sticky note floats on top!
    backgroundColor: '#f7f4ee',
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false
    }
  });

  stickyWin.setAlwaysOnTop(true, 'screen-saver');

  const stickyUrl = path.join(__dirname, 'src', 'sticky.html') + `?filePath=${encodeURIComponent(filePath)}`;
  stickyWin.loadURL(`file:///${stickyUrl.replace(/\\/g, '/')}`);

  detachedWindows.set(filePath, stickyWin);

  stickyWin.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  stickyWin.on('maximize', () => {
    stickyWin.webContents.send('window-maximized-state', true);
  });

  stickyWin.on('unmaximize', () => {
    stickyWin.webContents.send('window-maximized-state', false);
  });

  stickyWin.on('closed', () => {
    detachedWindows.delete(filePath);
  });

  return true;
});
