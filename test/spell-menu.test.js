const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildEditorMenu, toMenuTemplate, MAX_SUGGESTIONS } = require('../src/lib/spell-menu');

const flags = (overrides = {}) => ({ canCut: true, canCopy: true, canPaste: true, canSelectAll: true, ...overrides });
const editable = (overrides = {}) => ({
  isEditable: true,
  selectionText: '',
  misspelledWord: '',
  dictionarySuggestions: [],
  editFlags: flags(),
  ...overrides
});
const on = { spellcheckEnabled: true };

test('a misspelled word lists its suggestions first, then "Add to dictionary"', () => {
  const items = buildEditorMenu(editable({ misspelledWord: 'teh', dictionarySuggestions: ['the', 'tech'] }), on);
  assert.deepEqual(items.slice(0, 4), [
    { label: 'the', action: 'replace', word: 'the' },
    { label: 'tech', action: 'replace', word: 'tech' },
    { label: 'Add "teh" to dictionary', action: 'learn', word: 'teh' },
    { type: 'separator' }
  ]);
});

test('a misspelled word without suggestions shows a disabled placeholder', () => {
  const items = buildEditorMenu(editable({ misspelledWord: 'qwzx' }), on);
  assert.deepEqual(items[0], { label: 'No suggestions', enabled: false });
  assert.equal(items[1].action, 'learn');
});

test('suggestions are capped', () => {
  const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const items = buildEditorMenu(editable({ misspelledWord: 'x', dictionarySuggestions: many }), on);
  assert.equal(items.filter(i => i.action === 'replace').length, MAX_SUGGESTIONS);
});

test('a correctly spelled spot in the editor gets the edit actions and the spelling toggle', () => {
  const items = buildEditorMenu(editable(), on);
  assert.equal(items.some(i => i.action === 'replace' || i.action === 'learn'), false);
  assert.deepEqual(items.filter(i => i.role).map(i => i.role), ['cut', 'copy', 'paste', 'selectAll']);
  assert.deepEqual(items.at(-1), { label: 'Check spelling', type: 'checkbox', checked: true, action: 'toggle-spellcheck' });
});

test('edit actions follow what the editor allows', () => {
  const items = buildEditorMenu(editable({ editFlags: flags({ canCut: false, canCopy: false }) }), on);
  const byRole = Object.fromEntries(items.filter(i => i.role).map(i => [i.role, i.enabled]));
  assert.deepEqual(byRole, { cut: false, copy: false, paste: true, selectAll: true });
});

test('with spelling turned off, misspellings are ignored and the toggle is unchecked', () => {
  const items = buildEditorMenu(editable({ misspelledWord: 'teh', dictionarySuggestions: ['the'] }), { spellcheckEnabled: false });
  assert.equal(items.some(i => i.action === 'replace' || i.action === 'learn'), false);
  assert.equal(items.at(-1).checked, false);
});

test('selected text outside an editor only offers Copy', () => {
  const items = buildEditorMenu({ isEditable: false, selectionText: 'hello', editFlags: flags() }, on);
  assert.deepEqual(items, [{ role: 'copy' }]);
});

test('a right-click on plain page chrome shows no menu', () => {
  assert.deepEqual(buildEditorMenu({ isEditable: false, selectionText: '', editFlags: flags() }, on), []);
  assert.deepEqual(buildEditorMenu({ isEditable: false, selectionText: '   ', editFlags: flags() }, on), []);
});

test('ampersands in words are escaped so Windows does not turn them into mnemonics', () => {
  const items = buildEditorMenu(editable({ misspelledWord: 'R&Dx', dictionarySuggestions: ['R&D'] }), on);
  assert.equal(items[0].label, 'R&&D');
  assert.equal(items[0].word, 'R&D');
  assert.equal(items[1].label, 'Add "R&&Dx" to dictionary');
});

test('very long flagged words are shortened in labels but kept whole for the action', () => {
  const blob = 'x'.repeat(200);
  const items = buildEditorMenu(editable({ misspelledWord: blob, dictionarySuggestions: [blob] }), on);
  assert.ok(items[0].label.length <= 41, `label length ${items[0].label.length}`);
  assert.ok(items[0].label.endsWith('…'));
  assert.equal(items[0].word, blob);
  assert.ok(items[1].label.length < 70);
  assert.equal(items[1].word, blob);
});

test('toMenuTemplate wires actions to a handler and drops the private fields', () => {
  const calls = [];
  const template = toMenuTemplate(
    [{ label: 'the', action: 'replace', word: 'the' }, { type: 'separator' }, { role: 'copy' }],
    (action, word) => calls.push([action, word])
  );
  assert.equal('action' in template[0], false);
  assert.equal('word' in template[0], false);
  template[0].click();
  assert.deepEqual(calls, [['replace', 'the']]);
  assert.deepEqual(template.slice(1), [{ type: 'separator' }, { role: 'copy' }]);
});
