/**
 * Real-app E2E harness: launches the actual Electron build with an isolated profile and a
 * throw-away vault, so the user's own settings and Documents vault are never touched.
 */

const { _electron } = require('playwright-core');
const electronPath = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const APP_DIR = path.resolve(__dirname, '..', '..');

function makeSandbox(notes = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pinnote-e2e-'));
  const userData = path.join(root, 'userData');
  const vault = path.join(root, 'vault');
  fs.mkdirSync(userData, { recursive: true });
  fs.mkdirSync(vault, { recursive: true });
  // "Folder/Note.md" creates the folder too; a key ending in "/" is an empty folder
  for (const [name, content] of Object.entries(notes)) {
    const target = path.join(vault, name);
    if (name.endsWith('/')) {
      fs.mkdirSync(target, { recursive: true });
      continue;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, 'utf-8');
  }
  fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({ vaultPath: vault }), 'utf-8');

  return {
    root,
    userData,
    vault,
    args: [APP_DIR, `--user-data-dir=${userData}`],
    read: (name) => fs.readFileSync(path.join(vault, name), 'utf-8'),
    exists: (name) => fs.existsSync(path.join(vault, name)),
    isDir: (name) => fs.existsSync(path.join(vault, name)) && fs.statSync(path.join(vault, name)).isDirectory(),
    list: () => fs.readdirSync(vault).filter(f => !f.startsWith('.')).sort(),
    cleanup: () => fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  };
}

async function launchApp(sandbox) {
  const app = await _electron.launch({ executablePath: electronPath, args: sandbox.args, timeout: 60000 });
  const win = await app.firstWindow();
  const pageErrors = [];
  win.on('pageerror', (err) => pageErrors.push(err.message));
  await win.waitForSelector('#note-tree .note-item, #note-tree .tree-empty');
  await win.waitForSelector('#save-status-indicator.saved');
  return { app, win, pageErrors };
}

/** Put the editor into a known state without going through the smart-editor key handlers */
async function setEditor(win, text, selStart = text.length, selEnd = selStart, selector = '#markdown-input') {
  await win.evaluate(([sel, t, s, e]) => {
    const el = document.querySelector(sel);
    el.focus();
    el.value = t;
    el.setSelectionRange(s, e);
  }, [selector, text, selStart, selEnd]);
}

const selectedText = (win, selector = '#markdown-input') =>
  win.evaluate((sel) => { const el = document.querySelector(sel); return el.value.slice(el.selectionStart, el.selectionEnd); }, selector);

/** Poll a Node-side condition (e.g. file contents) until it holds or times out */
async function waitFor(fn, { timeout = 5000, interval = 50 } = {}) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    last = await fn();
    if (last) return last;
    await new Promise(r => setTimeout(r, interval));
  }
  return last;
}

module.exports = { makeSandbox, launchApp, setEditor, selectedText, waitFor };
