/**
 * PinNote - Smart Markdown Editor Module
 * Handles auto-closing brackets/quotes, Tab indentation, smart Enter continuation, and formatting helpers
 */

// Pairs that auto-close on empty cursor (brackets, double quotes, backticks - single quote excluded so typing ' displays only ')
const AUTO_CLOSE_PAIRS = {
  '(': ')',
  '[': ']',
  '{': '}',
  '"': '"',
  '`': '`'
};

// All pairs eligible for wrapping existing selections
const WRAP_PAIRS = {
  ...AUTO_CLOSE_PAIRS,
  "'": "'"
};

/**
 * Insert a Markdown formatting helper at cursor or around selection
 */
function insertFormat(textarea, fmtType, onUpdate) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selectedText = textarea.value.substring(start, end);
  let replacement = '';
  let cursorStart = start;
  let cursorEnd = end;

  switch (fmtType) {
    case 'bold':
      if (selectedText) {
        replacement = `**${selectedText}**`;
        cursorStart = start + replacement.length;
        cursorEnd = cursorStart;
      } else {
        replacement = `****`;
        cursorStart = start + 2;
        cursorEnd = cursorStart;
      }
      break;
    case 'italic':
      if (selectedText) {
        replacement = `*${selectedText}*`;
        cursorStart = start + replacement.length;
        cursorEnd = cursorStart;
      } else {
        replacement = `**`;
        cursorStart = start + 1;
        cursorEnd = cursorStart;
      }
      break;
    case 'strikethrough':
      if (selectedText) {
        replacement = `~~${selectedText}~~`;
        cursorStart = start + replacement.length;
        cursorEnd = cursorStart;
      } else {
        replacement = `~~~~`;
        cursorStart = start + 2;
        cursorEnd = cursorStart;
      }
      break;
    case 'h1':
      replacement = `# ${selectedText || 'Heading 1'}`;
      cursorStart = start + replacement.length;
      cursorEnd = cursorStart;
      break;
    case 'h2':
      replacement = `## ${selectedText || 'Heading 2'}`;
      cursorStart = start + replacement.length;
      cursorEnd = cursorStart;
      break;
    case 'h3':
      replacement = `### ${selectedText || 'Heading 3'}`;
      cursorStart = start + replacement.length;
      cursorEnd = cursorStart;
      break;
    case 'task':
      replacement = `- [ ] ${selectedText || 'New task'}`;
      cursorStart = start + replacement.length;
      cursorEnd = cursorStart;
      break;
    case 'list':
      replacement = `- ${selectedText || 'List item'}`;
      cursorStart = start + replacement.length;
      cursorEnd = cursorStart;
      break;
    case 'quote':
      replacement = `> ${selectedText || 'Blockquote'}`;
      cursorStart = start + replacement.length;
      cursorEnd = cursorStart;
      break;
    case 'code':
      if (selectedText.includes('\n')) {
        replacement = `\`\`\`js\n${selectedText}\n\`\`\``;
        cursorStart = start + replacement.length;
        cursorEnd = cursorStart;
      } else if (selectedText) {
        replacement = `\`${selectedText}\``;
        cursorStart = start + replacement.length;
        cursorEnd = cursorStart;
      } else {
        replacement = `\`\`\`js\n// code snippet\n\`\`\``;
        cursorStart = start + 8;
        cursorEnd = cursorStart + 15;
      }
      break;
    case 'table':
      replacement = `| Header 1 | Header 2 |\n|---|---|\n| Cell 1 | Cell 2 |`;
      cursorStart = start + replacement.length;
      cursorEnd = cursorStart;
      break;
    case 'callout':
      replacement = `> [!NOTE]\n> ${selectedText || 'Callout content'}`;
      cursorStart = start + replacement.length;
      cursorEnd = cursorStart;
      break;
    case 'math':
      if (selectedText) {
        replacement = `$${selectedText}$`;
        cursorStart = start + replacement.length;
        cursorEnd = cursorStart;
      } else {
        replacement = `$$ E = mc^2 $$`;
        cursorStart = start + 3;
        cursorEnd = start + 11;
      }
      break;
    default:
      return;
  }

  textarea.setRangeText(replacement, start, end, 'end');
  textarea.setSelectionRange(cursorStart, cursorEnd);
  if (typeof onUpdate === 'function') onUpdate();
  textarea.focus();
}

/**
 * Attach smart Markdown keyboard listeners to a textarea
 */
function setupSmartEditor(textarea, { onChange, onSave }) {
  if (!textarea) return;

  textarea.addEventListener('keydown', (e) => {
    // 1. SELECTION WRAPPING & AUTO-CLOSING PAIRS
    if (!e.ctrlKey && !e.altKey) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      // Wrap selection if text is selected (including single quotes: 'selection')
      if (start !== end && WRAP_PAIRS[e.key]) {
        e.preventDefault();
        const closing = WRAP_PAIRS[e.key];
        const selected = textarea.value.substring(start, end);
        const wrapped = `${e.key}${selected}${closing}`;
        textarea.setRangeText(wrapped, start, end, 'end');
        textarea.setSelectionRange(start + 1, end + 1);
        if (onChange) onChange();
        return;
      }

      // Auto-close pairs on empty cursor (single quote excluded: typing ' just types ')
      if (start === end && AUTO_CLOSE_PAIRS[e.key]) {
        e.preventDefault();
        const closing = AUTO_CLOSE_PAIRS[e.key];
        textarea.setRangeText(`${e.key}${closing}`, start, end, 'end');
        textarea.setSelectionRange(start + 1, start + 1);
        if (onChange) onChange();
        return;
      }
    }

    // Backspace: remove both chars if between empty pair
    if (e.key === 'Backspace' && textarea.selectionStart === textarea.selectionEnd) {
      const pos = textarea.selectionStart;
      const prev = textarea.value[pos - 1];
      const next = textarea.value[pos];
      if (prev && AUTO_CLOSE_PAIRS[prev] === next) {
        e.preventDefault();
        textarea.setRangeText('', pos - 1, pos + 1, 'end');
        textarea.setSelectionRange(pos - 1, pos - 1);
        if (onChange) onChange();
        return;
      }
    }

    // 2. TAB & SHIFT+TAB (Indent / Unindent 2 spaces, Smart Navigation)
    if (e.key === 'Tab') {
      e.preventDefault();

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const value = textarea.value;

      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      let lineEnd = value.indexOf('\n', end);
      if (lineEnd === -1) lineEnd = value.length;

      const linesText = value.substring(lineStart, lineEnd);
      const linesArr = linesText.split('\n');
      const isMultiLine = linesArr.length > 1;

      if (e.shiftKey) {
        // Shift + Tab -> Unindent
        if (isMultiLine) {
          const unindented = linesArr.map(line => {
            if (line.startsWith('  ')) return line.slice(2);
            if (line.startsWith('\t') || line.startsWith(' ')) return line.slice(1);
            return line;
          }).join('\n');
          textarea.setRangeText(unindented, lineStart, lineEnd, 'end');
          textarea.setSelectionRange(lineStart, lineStart + unindented.length);
        } else {
          const currentLine = linesArr[0];
          let removed = 0;
          let unindented = currentLine;
          if (currentLine.startsWith('  ')) {
            removed = 2;
            unindented = currentLine.slice(2);
          } else if (currentLine.startsWith('\t') || currentLine.startsWith(' ')) {
            removed = 1;
            unindented = currentLine.slice(1);
          }
          if (removed > 0) {
            textarea.setRangeText(unindented, lineStart, lineEnd, 'end');
            const newStart = Math.max(lineStart, start - removed);
            const newEnd = Math.max(lineStart, end - removed);
            textarea.setSelectionRange(newStart, newEnd);
          }
        }
        if (onChange) onChange();
        return;
      }

      // Tab key
      if (isMultiLine) {
        const indented = linesArr.map(line => '  ' + line).join('\n');
        textarea.setRangeText(indented, lineStart, lineEnd, 'end');
        textarea.setSelectionRange(lineStart, lineStart + indented.length);
        if (onChange) onChange();
        return;
      }

      // Single line
      // Tab out of closing markdown/bracket tokens if cursor is right before them
      if (start === end) {
        const afterCursor = value.substring(start);
        const charBefore = start > 0 ? value[start - 1] : '';
        const hasTextBefore = charBefore !== '' && !/\s/.test(charBefore);

        const mdTokens = ['**', '~~', '$$', '*', '`'];
        const bracketTokens = [']', ')', '}', '"', "'"];

        let matched = null;
        if (hasTextBefore) {
          matched = mdTokens.find(token => afterCursor.startsWith(token));
        }
        if (!matched) {
          matched = bracketTokens.find(token => afterCursor.startsWith(token));
        }

        if (matched) {
          textarea.setSelectionRange(start + matched.length, start + matched.length);
          if (onChange) onChange();
          return;
        }
      }

      const currentLine = linesArr[0];
      const currentLineBeforeCursor = value.substring(lineStart, start);
      const isListLine = /^\s*([\-\*]\s+|\d+\.\s+|\-\s*\[[ xX]\]\s+)/.test(currentLine);
      const isAtLineStart = currentLineBeforeCursor.trim() === '';

      if (isListLine || isAtLineStart) {
        const indented = '  ' + currentLine;
        textarea.setRangeText(indented, lineStart, lineEnd, 'end');
        if (start === end) {
          textarea.setSelectionRange(start + 2, start + 2);
        } else {
          textarea.setSelectionRange(start + 2, end + 2);
        }
      } else {
        textarea.setRangeText('  ', start, end, 'end');
        textarea.setSelectionRange(start + 2, start + 2);
      }

      if (onChange) onChange();
      return;
    }

    // 3. ENTER (Smart List & Task Continuation)
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
      const start = textarea.selectionStart;
      const value = textarea.value;
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const currentLine = value.substring(lineStart, start);

      // Task List: "- [ ] " or "- [x] "
      const taskMatch = currentLine.match(/^(\s*)([\-\*]\s*\[[ xX]\])\s*(.*)/);
      if (taskMatch) {
        e.preventDefault();
        const indent = taskMatch[1];
        const content = taskMatch[3].trim();

        if (content === '') {
          textarea.setRangeText('', lineStart, start, 'end');
        } else {
          textarea.setRangeText(`\n${indent}- [ ] `, start, start, 'end');
        }
        if (onChange) onChange();
        return;
      }

      // Bullet List: "- " or "* "
      const bulletMatch = currentLine.match(/^(\s*)([\-\*])\s+(.*)/);
      if (bulletMatch) {
        e.preventDefault();
        const indent = bulletMatch[1];
        const bullet = bulletMatch[2];
        const content = bulletMatch[3].trim();

        if (content === '') {
          textarea.setRangeText('', lineStart, start, 'end');
        } else {
          textarea.setRangeText(`\n${indent}${bullet} `, start, start, 'end');
        }
        if (onChange) onChange();
        return;
      }

      // Numbered List: "1. ", "2. "
      const numberMatch = currentLine.match(/^(\s*)(\d+)\.\s+(.*)/);
      if (numberMatch) {
        e.preventDefault();
        const indent = numberMatch[1];
        const num = parseInt(numberMatch[2], 10);
        const content = numberMatch[3].trim();

        if (content === '') {
          textarea.setRangeText('', lineStart, start, 'end');
        } else {
          textarea.setRangeText(`\n${indent}${num + 1}. `, start, start, 'end');
        }
        if (onChange) onChange();
        return;
      }
    }

    // 4. In-editor shortcuts: Ctrl + B, Ctrl + I, Ctrl + S
    if (e.ctrlKey) {
      if (e.key.toLowerCase() === 'b') {
        e.preventDefault();
        insertFormat(textarea, 'bold', onChange);
      } else if (e.key.toLowerCase() === 'i') {
        e.preventDefault();
        insertFormat(textarea, 'italic', onChange);
      } else if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (onSave) onSave();
      }
    }
  });
}

module.exports = {
  setupSmartEditor,
  insertFormat
};
