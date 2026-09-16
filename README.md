# PinNote 📌

An elegant, lightweight Obsidian-inspired Markdown note-taking app with detached Always-On-Top desktop sticky notes, full revision history, KaTeX math, and a cozy Warm White aesthetic.

---

## ✨ Features

- **Warm White Aesthetic**: Thoughtfully tuned warm-white paper palette (`#fcfbf9`) designed for long writing sessions with zero eye strain.
- **Detached Floating Sticky Notes**: Pop out any note into an independent, compact desktop sticky window with **Always-on-Top** pinning and opacity control.
- **Smart Markdown Editor**:
  - Auto-closing brackets and quotes (`()`, `[]`, `{}`, `""`, `` ` ``).
  - Smart natural single-quote typing (contractions like *don't*, *it's* work seamlessly).
  - Tab-out navigation over markdown markers (`**bold|**` → `**bold**|`).
  - Intelligent list and task list continuation on Enter (`- [ ]`, `- `, `1. `).
  - Multi-line indentation (`Tab`) and unindentation (`Shift + Tab`).
  - Quick format helpers (`Ctrl + B`, `Ctrl + I`, `Ctrl + S`).
- **Rich Markdown Rendering**:
  - Obsidian-style Callouts (`> [!NOTE]`, `> [!TIP]`, `> [!WARNING]`, etc.).
  - KaTeX mathematical equations (`$$ E = mc^2 $$` and inline math).
  - Code syntax highlighting with one-click copy buttons.
  - Interactive checklists with live two-way synchronization.
  - Wiki links (`[[Note Title]]`) for fast cross-note linking.
  - `#tag` cloud and search filtering.
- **Revision History ("Back to History")**:
  - Automatic snapshots recorded on edit checkpoints and saves.
  - Dual-pane History modal (`Ctrl + H` or toolbar button).
  - Human-readable timestamps, word counts, and live markdown preview of past versions.
  - One-click **"Restore This Version"** with automated safety backup.
- **Date-Month Default Naming**: New notes automatically default to the current date and month (e.g. `16-09.md`).
- **Quick Switcher**: Instant fuzzy search across all notes with keyboard navigation (`Ctrl + K`).
- **Synchronized Scrolling**: Dual-pane editor and preview scroll in harmony.

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
| `Ctrl + =` / `Ctrl + +` | Zoom in (increase font size) |
| `Ctrl + -` | Zoom out (decrease font size) |
| `Ctrl + 0` | Reset font size to default (20px) |
| `Ctrl + B` | Bold selection / insert `****` |
| `Ctrl + I` | Italicize selection / insert `**` |
| `Tab` | Indent line(s) / tab out of closing tokens |
| `Shift + Tab` | Unindent line(s) |
| `Esc` | Close modal / cancel rename |

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
├── main.js                  # Electron main process (lifecycle, IPC, window management)
├── preload.js               # Context bridge secure API exposure
├── package.json
├── src/
│   ├── index.html           # Main application shell
│   ├── styles.css           # Warm White design system & typography
│   ├── app.js               # Application orchestrator
│   ├── sticky.html          # Floating sticky note UI
│   ├── sticky.js            # Sticky note window controller
│   └── modules/
│       ├── markdown.js      # KaTeX, callouts, checklists, tags, code copy
│       ├── smart-editor.js  # Smart typing pairs, tab-out, indentation
│       ├── note-manager.js  # Note lifecycle, DD-MM.md naming, pinned notes
│       ├── history.js       # Revision snapshotting & relative timestamping
│       ├── history-modal.js # Dual-pane history modal & 1-click restore
│       ├── quick-switcher.js# Fuzzy search modal (Ctrl + K)
│       └── ui-controls.js   # View modes, font zooming, opacity, sync scroll
└── sample-vault/            # Starter markdown notes
```

---

## 📄 License

MIT License © 2026 Antigravity
