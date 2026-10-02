# PinNote 📌

An elegant, lightweight Obsidian-inspired Markdown note-taking app with detached Always-On-Top desktop sticky notes, full revision history, KaTeX math, and a cozy Warm White aesthetic.

---

## ✨ Features

- **Warm White Aesthetic**: Thoughtfully tuned warm-white paper palette (`#fcfbf9`) designed for long writing sessions with zero eye strain.
- **Detached Floating Sticky Notes**: Pop out any note into an independent, compact desktop sticky window with **Always-on-Top** pinning and opacity control.
- **Smart Markdown Editor**:
  - Auto-closing brackets and quotes (`()`, `[]`, `{}`, `""`, `` ` ``); typing the closer steps over it instead of doubling it.
  - Smart natural single-quote typing (contractions like *don't*, *it's* work seamlessly).
  - Tab-out navigation over markdown markers (`**bold|**` → `**bold**|`).
  - Intelligent list and task list continuation on Enter (`- [ ]`, `- `, `1. `).
  - Multi-line indentation (`Tab`) and unindentation (`Shift + Tab`).
  - Quick format helpers (`Ctrl + B`, `Ctrl + I`, `Ctrl + S`); heading, list, task and quote buttons apply to the current or every selected line.
- **Rich Markdown Rendering**:
  - Obsidian-style Callouts (`> [!NOTE]`, `> [!TIP]`, `> [!WARNING]`, etc.).
  - KaTeX mathematical equations (`$$ E = mc^2 $$` and inline math).
  - Code syntax highlighting with one-click copy buttons.
  - Interactive checklists with live two-way synchronization.
  - Wiki links (`[[Note Title]]`, `[[Note|shown text]]`, `[[Note#Heading]]`, `[[folder/Note]]`) for fast cross-note linking.
  - `#tag` cloud and search filtering.
- **Revision History ("Back to History")**:
  - Automatic snapshots recorded on edit checkpoints and saves.
  - Dual-pane History modal (`Ctrl + H` or toolbar button).
  - Human-readable timestamps, word counts, and live markdown preview of past versions.
  - One-click **"Restore This Version"** with automated safety backup.
- **Date-Month Default Naming**: New notes automatically default to the current date and month (e.g. `16-09.md`).
- **Quick Switcher**: Instant fuzzy search across all notes with keyboard navigation (`Ctrl + K`).
- **Synchronized Scrolling**: Dual-pane editor and preview scroll in harmony.
- **Note Status**: Mark a note **To do**, **Doing**, **Waiting** or **Done** from the picker next to its name. The status is saved in the note's YAML front-matter (`status: todo`), so it travels with the file and Obsidian reads it as a property; the preview hides it. Sidebar badges show each note's status, and the **Open** filter lists only notes still To do, Doing or Waiting, so nothing gets forgotten.
- **Folders & Filters**: Notes are shown inside their folders (real folders on disk, nested as deep as you like), with note counts; click a folder to collapse it. Status chips (**All**, **Open**, **To do**, **Doing**, **Waiting**, **Done**) filter the tree, and *Show only this folder* narrows everything — tree, counts and new notes — to one folder, so "Work + Waiting" is two clicks. Create folders from the sidebar header or a folder's hover actions, and drag a note onto a folder (or the empty list area for the root) to move it; its revision history, pin and open sticky window move with it.
- **Git Sync with a Commit Guard** (`Ctrl + Shift + G`, or the Git item in the status bar): initialize the vault as a repository, connect your GitHub repo, and **Commit**, **Pull**, **Push** or one-click **Sync** (commit → pull --rebase → push). Uses your installed Git and its sign-in; a conflicting pull is aborted cleanly. *Commit as* sets the author for the vault repo only, so a work identity is never used. **Local-only folders** stay on your computer and are never committed (managed block in `.gitignore`, marked `local` in the sidebar).
  - The **commit guard** scans everything you commit and push — added lines, file names and the commit author — against rules in `.pinnote/guard.txt` (never committed). Defaults cover company names (`nexon`), confidentiality labels in English and Vietnamese, API keys and passwords, `.env` secrets, database URLs with passwords, JWT/Bearer tokens, cloud provider keys, private keys, internal IPs and phone numbers. A match stops the commit or push and lists file, line and rule; you can edit the note or explicitly confirm.
- **Resizable Sidebar**: Drag the sidebar edge (or focus it and use `←` / `→`); double-click resets the width. The width is remembered.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Ctrl + N` | Create a new note (default name: `DD-MM.md`) |
| `Ctrl + S` | Save current note & create history checkpoint |
| `Ctrl + H` | Open Note Revision History modal |
| `Ctrl + K` | Open Quick Switcher note finder |
| `Ctrl + P` | Pop out active note to floating desktop sticky window |
| `Ctrl + \` | Toggle sidebar visibility |
| `Ctrl + =` / `Ctrl + +` | Larger editor & preview text |
| `Ctrl + -` | Smaller editor & preview text |
| `Ctrl + 0` | Reset editor text size to default (20px) |
| `Ctrl + Shift + =` | Larger interface (sidebar, toolbars, dialogs) |
| `Ctrl + Shift + -` | Smaller interface |
| `Ctrl + Shift + 0` | Reset interface size to 100% |
| `Ctrl + B` | Bold selection / insert `****` |
| `Ctrl + I` | Italicize selection / insert `**` |
| `Tab` | Indent line(s) / tab out of closing tokens |
| `Shift + Tab` | Unindent line(s) |
| `Esc` | Close modal / cancel rename / clear sidebar search |
| `F2` / `Enter` on a sidebar note | Rename / open it |

The interface size is also adjustable from the status bar (`Interface − 100% +`); it is saved and shared with sticky windows.

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- npm

### Installation
```bash
# Clone the repository
git clone <YOUR_REPOSITORY_URL>
cd PinNote

# Install dependencies
npm install

# Launch the app
npm start
```

---

## 📁 Project Architecture

```
PinNote/
├── main.js                  # Electron main process (lifecycle, IPC, vault path confinement)
├── preload.js               # Context bridge: IPC API + sanitized markdown rendering
├── package.json
├── src/
│   ├── index.html           # Main application shell
│   ├── styles.css           # Warm White design system & typography
│   ├── app.js               # Application orchestrator
│   ├── sticky.html          # Floating sticky note UI
│   ├── sticky.js            # Sticky note window controller
│   ├── lib/                 # Node-side, DOM-free (used by main, preload and tests)
│   │   ├── markdown.js      # Marked + KaTeX + highlight.js + callouts, sanitized by DOMPurify
│   │   └── text-utils.js    # Task toggling, tags, note-name & path safety helpers
│   └── modules/             # Renderer ES modules (no Node access)
│       ├── preview.js       # Bridge wrappers, checkbox/wiki-link wiring, code copy buttons
│       ├── smart-editor.js  # Smart typing pairs, tab-out, indentation
│       ├── note-manager.js  # Note lifecycle, DD-MM.md naming, pinned notes
│       ├── history.js       # Revision snapshotting & relative timestamping
│       ├── history-modal.js # Dual-pane history modal & 1-click restore
│       ├── quick-switcher.js# Fuzzy search modal (Ctrl + K)
│       └── ui-controls.js   # View modes, font zooming, opacity, sync scroll
├── test/                    # node:test suites (npm test)
│   └── e2e/                 # Real-app Electron tests (npm run test:e2e)
└── sample-vault/            # Starter markdown notes
```
---

## 🧪 Tests

```bash
npm test
```

Covers markdown sanitizing (XSS), callouts, math, syntax highlighting, checkbox indexing, wiki-link parsing and resolution, tag extraction, note-name sanitizing and vault path confinement.

```bash
npm run test:e2e
```

Launches the real Electron app through `playwright-core` with a throw-away profile (`--user-data-dir`) and a temporary vault, so your own settings and `Documents\PinNote Vault` are never touched. It covers the smart editor, notes and wiki links, sticky windows (live sync, delete, close flush, relaunch) and the sidebar/toolbar layout. Run it from Windows (`cmd`/PowerShell): the Electron binary in `node_modules` is platform-specific.

## 🔒 Security Model

Notes are untrusted input (a vault can be any folder, including synced or downloaded ones), so:

- Windows run with `contextIsolation: true` and `nodeIntegration: false`; the page has no `require`.
- Markdown is rendered in the preload and sanitized with DOMPurify before it reaches the DOM; a CSP blocks inline and remote scripts.
- File IPC only accepts paths inside the open vault; note names are sanitized (no `..`, separators or reserved names).
- Links open externally only for `http`, `https` and `mailto`; the app window can never be navigated away.

---

## 📦 Building Standalone Windows Executable (.exe)

```bash
# Build Windows installer and portable .exe
npm run build

# Build portable .exe only
npm run build:portable

# Build unpacked directory with PinNote.exe
npm run build:dir
```

The compiled binaries will be output to the `dist/` directory:
- `dist/PinNote-Portable-1.0.0.exe` — Single portable standalone executable (no installation needed)
- `dist/PinNote Setup 1.0.0.exe` — Windows NSIS installer
- `dist/win-unpacked/PinNote.exe` — Standalone unpacked application

---

## 📄 License

MIT License © 2026 Antigravity
