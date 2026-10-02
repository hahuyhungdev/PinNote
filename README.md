# PinNote 📌

An Obsidian-style Markdown notes app for Windows. Write in a warm, paper-like editor, pin any note to your desktop as an always-on-top sticky window, track each note's status, organize notes in folders, and back the whole vault up to GitHub, with a commit guard that stops company names and secrets from leaving your machine.

Notes are plain `.md` files in a folder you choose, so they stay readable in any editor (including Obsidian).

---

## ✨ Features

### Writing
- **Smart Markdown editor**
  - Auto-closing `()`, `[]`, `{}`, `""` and `` ` ``. Typing the closer steps over it instead of doubling it.
  - Single quotes are never auto-closed, so contractions like *don't* type naturally.
  - Enter continues lists, task lists and numbered lists. `Tab` / `Shift + Tab` indent and unindent one or many lines, and `Tab` also steps out of closing markers (`**bold|**` → `**bold**|`).
  - Toolbar and shortcuts for bold, italic, strikethrough, headings, lists, tasks, quotes, code, tables, callouts and math. Heading, list, task and quote buttons apply to the current line, or to every selected line.
  - Input-method friendly: smart keys stay out of the way while an IME (e.g. Vietnamese Telex) is composing.
- **English spell check** in the editor and sticky notes. Misspelled words are underlined. Right-click one for suggestions or *Add to dictionary*. The right-click menu also has Cut, Copy, Paste and Select all, and a **Check spelling** toggle that PinNote remembers.
  - **Fix from the keyboard** with `Ctrl + Space`: PinNote finds the misspelled word at the cursor, or the nearest one before it, highlights it and lists fixes beside it, likeliest first. Pick one with `1`–`5`, or `↑` / `↓` and `Enter`. `Esc` cancels, and `Ctrl + Z` undoes a fix. If an input method that switches on with `Ctrl + Space` (for example a Chinese IME) is active, Windows may take the key first.
  - Code, code blocks and links are skipped. Fixes come from an offline English dictionary, so your text never leaves your computer.
- **Rich preview**
  - Obsidian-style callouts (`> [!NOTE]`, `> [!TIP]`, `> [!WARNING]`, `> [!CAUTION]`, `> [!IMPORTANT]`).
  - KaTeX math (`$$ E = mc^2 $$` and inline `$x^2$`; prices like "$5 and $10" stay plain text).
  - Syntax-highlighted code with one-click copy buttons.
  - Interactive checklists: ticking a box in the preview updates the note.
  - Wiki links: `[[Note]]`, `[[Note|shown text]]`, `[[Note#Heading]]`, `[[folder/Note]]`. A link to a missing note creates it.
- **Outline (table of contents):** toggle it with the title-bar button or `Ctrl + Shift + O`. It lists the note's headings, indented by level. Click one to jump the editor and the preview there. The section you are reading is highlighted as you scroll.
- **Edit, Split and Preview modes**, with synchronized scrolling in Split mode.

### Organizing
- **Folders:** notes appear inside collapsible folders (real folders on disk, nested as deep as you like) with note counts.
  - Create folders from the sidebar header or from a folder's hover actions.
  - Create a note directly inside a folder.
  - Drag a note onto a folder to move it. Its revision history, pin and sticky window move with it.
- **Note status:** mark a note **To do**, **Doing**, **Waiting** or **Done** with the picker next to its name.
  - The status is stored in the note's YAML front-matter (`status: todo`), so it travels with the file and Obsidian reads it as a property. The preview hides it.
- **Filters:**
  - Status chips filter the folder tree: **All**, **Open** (To do + Doing + Waiting), or a single status.
  - *Show only this folder* narrows the tree, the counts and new notes to one folder. "Work + Waiting" is two clicks.
- **Search:** filter by name, or type `#tag` to find notes containing that tag. A tag cloud shows the current note's tags.
- **Quick Switcher** (`Ctrl + K`) to jump to any note by name.
- **Pinned notes** stay at the top of the sidebar.
- **Resizable sidebar:** drag its edge, or focus the edge and use `←` / `→`. Double-click resets it.

### Sticky notes
- **Pop out** any note (`Ctrl + P`) into a compact, independent desktop window.
- **Always on top** (toggle per window), with adjustable opacity and text size.
- **Live sync:** edits in a sticky window and in the main window stay in step.

### History and safety
- **Revision history** (`Ctrl + H`): snapshots are recorded as you write and save. Browse them with a live preview, and restore any version in one click (your current text is saved first).
- **Autosave**, plus a flush of pending edits whenever a window closes.

### Git sync with a commit guard
Open the Git panel with `Ctrl + Shift + G`, or from the Git item in the status bar.

- **Set up in the app:** initialize the vault as a repository, set *Commit as*, and connect your GitHub repository.
  - *Commit as* is stored in the vault's repository only, so your global (for example work) Git identity is never used for your notes.
- **Commit, Pull, Push**, or one-click **Sync** (commit → pull with rebase → push).
  - Uses your installed Git and its sign-in (Git Credential Manager).
  - A conflicting pull is aborted cleanly, and your commits are kept.
- **Local-only folders** stay on your computer and are never committed. They are marked `local` in the sidebar.
- **Commit guard:** every commit and push is scanned for sensitive content before it happens.
  - What it scans: added lines, file names and the commit author. Push also checks commits made outside PinNote.
  - Default rules cover company names (`nexon`), confidentiality labels in English and Vietnamese ("confidential", "internal only", "bảo mật", "nội bộ", "mật khẩu"), API keys and passwords, `.env` secrets, database URLs with passwords, Bearer/JWT tokens, cloud-provider keys, private keys, private-network IPs and Vietnamese phone numbers.
  - A match stops the commit or push and lists file, line and rule. Edit the note, or confirm in a system dialog.
  - Rules are editable in the panel. They are stored in PinNote's settings, not inside the vault, so they are never committed and a downloaded vault cannot switch them off.

### Comfort
- Warm White palette tuned for long writing sessions.
- **Editor text size** (`Ctrl + =` / `Ctrl + -`) and an independent **interface scale** (`Ctrl + Shift + =` / `Ctrl + Shift + -`, also in the status bar).
- Adjustable window opacity.
- New notes are named after today's date (`DD-MM.md`).

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Ctrl + N` | New note (in the focused folder, named `DD-MM.md`) |
| `Ctrl + S` | Save and record a history checkpoint |
| `Ctrl + K` | Quick Switcher |
| `Ctrl + P` | Pop out the note as a sticky window |
| `Ctrl + H` | Revision history |
| `Ctrl + Shift + O` | Toggle the outline |
| `Ctrl + Shift + G` | Git panel |
| `Ctrl + \` | Toggle the sidebar |
| `Ctrl + B` / `Ctrl + I` | Bold / italic |
| `Ctrl + Space` | Fix the nearest misspelled word (`1`–`5` or `↑` `↓` `Enter` to pick, `Esc` to cancel) |
| `Tab` / `Shift + Tab` | Indent / unindent (or step out of a closing marker) |
| `Ctrl + =` / `Ctrl + -` / `Ctrl + 0` | Editor text larger / smaller / reset |
| `Ctrl + Shift + =` / `Ctrl + Shift + -` / `Ctrl + Shift + 0` | Interface larger / smaller / reset |
| `F2` / `Enter` / `Delete` on a sidebar note | Rename / open / delete |
| `Esc` | Close a dialog, cancel a rename, or clear the search |

---

## 🚀 Getting Started

### Prerequisites
- Windows 10 or 11
- [Node.js](https://nodejs.org/) 18 or newer, with npm
- [Git for Windows](https://git-scm.com/download/win), only needed for the Git features

### Run from source
```bash
git clone https://github.com/hahuyhungdev/PinNote.git
cd PinNote
npm install
npm start
```

You can also double-click `run.bat`, which launches the built app if it exists, otherwise the development build.

On first launch PinNote creates a vault at `Documents\PinNote Vault` with two starter notes. Use the folder button in the sidebar to open any other folder as your vault.

### Back up your notes to GitHub
1. Create an empty repository on GitHub (private is a good idea).
2. In PinNote, press `Ctrl + Shift + G` and click **Initialize Git**.
3. Fill in **Commit as** with the name and email you want on GitHub, then click **Save**.
4. Mark any folders that must never leave your machine as **local-only**.
5. Paste the repository URL into **Remote** and click **Connect**.
6. Click **Sync**. The first push may open a GitHub sign-in window.

---

## 📦 Building a Windows Executable

```bash
npm run build            # NSIS installer + portable .exe
npm run build:portable   # portable .exe only
npm run build:dir        # unpacked folder with PinNote.exe
```

Output goes to `dist/`:
- `dist/PinNote-Portable-1.0.0.exe`: a single portable executable (no installation needed)
- `dist/PinNote Setup 1.0.0.exe`: the Windows installer
- `dist/win-unpacked/PinNote.exe`: the unpacked application

---

## 🧪 Tests

```bash
npm test          # unit tests
npm run test:e2e  # end-to-end tests against the real app
```

- **Unit tests** (`node:test`) cover:
  - markdown sanitizing (XSS), callouts, math and highlighting
  - checkbox indexing, tags, headings, front-matter status, wiki-link resolution
  - folder filtering, note-name and path safety
  - the commit guard rules
  - the editor's right-click menu (spelling suggestions, edit actions, spelling toggle)
  - spelling fixes: finding words near the cursor (skipping code and links), and ranking likely fixes first
  - the Git service, run against real temporary repositories and a local "remote". Git must be installed.
- **End-to-end tests** launch the real Electron app with `playwright-core`, using a throw-away profile (`--user-data-dir`) and a temporary vault, so your own settings and notes are never touched. They cover:
  - the editor, notes and wiki links
  - sticky windows: live sync, delete, flush on close, relaunch
  - status, folders and filters, and folder actions (including drag and drop)
  - the outline, the sidebar and toolbar layout
  - the Git panel and commit guard
  - spell checking: fixing a word from the right-click menu, and keeping the toggle across sticky windows and restarts
  - the `Ctrl + Space` fix: keys, caret placement, undo, cancel, *Add to dictionary* and sticky windows
  - protection against hostile vaults

  Run them from Windows (`cmd` or PowerShell), because the Electron binary in `node_modules` is platform-specific.

---

## 📁 Project Structure

```
PinNote/
├── main.js                   # Electron main process: windows, IPC, vault confinement, Git & guard IPC
├── preload.js                # Context bridge: IPC API + sanitized Markdown rendering
├── run.bat                   # Windows launcher
├── src/
│   ├── index.html            # Main window
│   ├── styles.css            # Warm White design system
│   ├── git-panel.css         # Git panel styles
│   ├── app.js                # Main window orchestrator
│   ├── sticky.html / .js     # Sticky note window
│   ├── lib/                  # Node-side, DOM-free (used by main, preload and tests)
│   │   ├── markdown.js       # Marked + KaTeX + highlight.js + callouts, sanitized by DOMPurify
│   │   ├── text-utils.js     # Tasks, tags, headings, front-matter status, wiki links, path safety
│   │   ├── git-service.js    # Git commands for the vault (hardened against hostile repos)
│   │   ├── commit-guard.js   # Sensitive-content rules and diff scanning
│   │   ├── spell-menu.js     # Editor right-click menu: spelling fixes and edit actions
│   │   └── spell-suggest.js  # Offline English dictionary and fix ranking for Ctrl + Space
│   └── modules/              # Renderer ES modules (no Node access)
│       ├── smart-editor.js   # Smart typing, list continuation, indentation, formatting
│       ├── preview.js        # Bridge wrappers, checkbox/wiki-link wiring, copy buttons
│       ├── note-manager.js   # Folder tree, note actions, drag and drop, inline rename
│       ├── note-filter.js    # Status / tag / folder filtering of the tree
│       ├── note-status.js    # Status labels
│       ├── outline.js        # Outline (table of contents)
│       ├── git-panel.js      # Git panel and commit-guard review
│       ├── history.js        # Revision snapshots and timestamps
│       ├── history-modal.js  # History browser and restore
│       ├── quick-switcher.js # Ctrl + K note finder
│       ├── spell-fix.js      # Ctrl + Space spelling fix list at the cursor
│       ├── spell-words.js    # Words near the cursor (skips code and links)
│       └── ui-controls.js    # View modes, text size, interface scale, opacity, sidebar resize
├── test/                     # Unit tests (npm test)
│   └── e2e/                  # Real-app tests (npm run test:e2e)
└── sample-vault/             # Starter notes copied into a new vault
```

---

## 🔒 Security Model

A vault can be any folder, including synced or downloaded ones, so note content and the vault's own files are treated as untrusted:

- **Isolated page:** windows run with `contextIsolation: true` and `nodeIntegration: false`, so the page has no Node access.
- **Sanitized rendering:** Markdown is rendered in the preload and sanitized with DOMPurify, and a Content Security Policy blocks inline and remote scripts.
- **Vault confinement:** file and folder IPC only accept paths inside the open vault, with symlinks resolved. Note and folder names are sanitized (no `..`, separators or reserved names).
- **Safe links:** links open externally only for `http`, `https` and `mailto`, and the app window can never be navigated away.
- **Hardened Git:**
  - Git runs with fixed argument lists and no shell.
  - Repository hooks, `fsmonitor` and the `ext::` transport are disabled.
  - A vault whose `.git/config` can run programs (fsmonitor, sshCommand, credential helpers, filters, textconv, includes, …) is refused instead of executed.
- **Guard overrides need you:** overriding the commit guard is confirmed by the main process in a native dialog. The page alone cannot force a commit or push.
- **No writing through planted links:** `.gitignore` symlinks are refused, and revision history is written to app data if `.pinnote` points outside the vault.

---

## 📄 License

[MIT](LICENSE) © 2026 hahuyhungdev
