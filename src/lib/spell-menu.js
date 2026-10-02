/**
 * Right-click menu for editable text: spelling fixes, edit actions and the spelling toggle.
 * Pure data so it can be tested without Electron; main.js turns it into a native Menu.
 */

const MAX_SUGGESTIONS = 5;
const MAX_LABEL_WORD = 40;

// Long tokens (e.g. a pasted blob) are shortened for display only. Windows reads "&" in a menu
// label as a mnemonic marker; "&&" shows a literal ampersand.
const escapeLabel = (text) => {
  const word = String(text);
  const shown = word.length > MAX_LABEL_WORD ? `${word.slice(0, MAX_LABEL_WORD)}…` : word;
  return shown.replace(/&/g, '&&');
};

/**
 * @param {object} params Electron's context-menu params
 * @param {{ spellcheckEnabled: boolean }} options
 * @returns {object[]} menu items; `action`/`word` mark items main.js must handle
 */
function buildEditorMenu(params, { spellcheckEnabled }) {
  const { isEditable, selectionText = '', misspelledWord = '', dictionarySuggestions = [], editFlags = {} } = params;

  if (!isEditable) {
    return selectionText.trim() ? [{ role: 'copy' }] : [];
  }

  const items = [];
  if (spellcheckEnabled && misspelledWord) {
    const suggestions = dictionarySuggestions.slice(0, MAX_SUGGESTIONS);
    if (suggestions.length) {
      for (const word of suggestions) items.push({ label: escapeLabel(word), action: 'replace', word });
    } else {
      items.push({ label: 'No suggestions', enabled: false });
    }
    items.push({ label: `Add "${escapeLabel(misspelledWord)}" to dictionary`, action: 'learn', word: misspelledWord });
    items.push({ type: 'separator' });
  }

  items.push(
    { role: 'cut', enabled: Boolean(editFlags.canCut) },
    { role: 'copy', enabled: Boolean(editFlags.canCopy) },
    { role: 'paste', enabled: Boolean(editFlags.canPaste) },
    { type: 'separator' },
    { role: 'selectAll', enabled: Boolean(editFlags.canSelectAll) },
    { type: 'separator' },
    { label: 'Check spelling', type: 'checkbox', checked: Boolean(spellcheckEnabled), action: 'toggle-spellcheck' }
  );
  return items;
}

/** Turn menu items into an Electron template, routing `action` items to `onAction(action, word)` */
function toMenuTemplate(items, onAction) {
  return items.map(({ action, word, ...item }) => (action ? { ...item, click: () => onAction(action, word) } : item));
}

module.exports = { buildEditorMenu, toMenuTemplate, MAX_SUGGESTIONS };
