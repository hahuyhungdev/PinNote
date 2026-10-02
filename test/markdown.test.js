const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const { createMarkdownRenderer } = require('../src/lib/markdown');
const { toggleTaskCheckbox } = require('../src/lib/text-utils');

const { window } = new JSDOM('');
const { render } = createMarkdownRenderer(window);

const toDom = (html) => {
  const el = window.document.createElement('div');
  el.innerHTML = html;
  return el;
};

test('strips script-capable HTML from notes', () => {
  const html = render([
    '<img src=x onerror="alert(1)">',
    '<script>alert(2)</script>',
    '<a href="javascript:alert(3)">x</a>',
    '<iframe src="https://evil"></iframe>'
  ].join('\n\n'));

  assert.doesNotMatch(html, /onerror/i);
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /javascript:/i);
  assert.doesNotMatch(html, /<iframe/i);
});

test('wiki link titles cannot break out of the attribute', () => {
  const dom = toDom(render('[[x" onmouseover="alert(1)]]'));
  const link = dom.querySelector('a.wiki-link');
  assert.ok(link);
  assert.equal(link.getAttribute('onmouseover'), null);
  assert.equal(link.getAttribute('data-target'), 'x" onmouseover="alert(1)');
});

test('wiki links support |alias and #heading like Obsidian', () => {
  const dom = toDom(render('[[Gamma|the alias]] [[Alpha#Intro]] [[Beta#Part|shown]]'));
  const links = [...dom.querySelectorAll('a.wiki-link')];
  // The full link text is kept; resolution decides whether "#..." is a heading or part of the title
  assert.deepEqual(links.map(a => a.getAttribute('data-target')), ['Gamma', 'Alpha#Intro', 'Beta#Part']);
  assert.deepEqual(links.map(a => a.textContent), ['the alias', 'Alpha#Intro', 'shown']);
});

test('wiki links inside code are left alone', () => {
  const dom = toDom(render('`[[Not a link]]`'));
  assert.equal(dom.querySelector('a.wiki-link'), null);
  assert.equal(dom.querySelector('code').textContent, '[[Not a link]]');
});

test('task checkboxes stay interactive (not disabled)', () => {
  const dom = toDom(render('- [ ] one\n- [x] two'));
  const boxes = dom.querySelectorAll('input[type="checkbox"]');
  assert.equal(boxes.length, 2);
  assert.equal(boxes[0].hasAttribute('disabled'), false);
  assert.equal(boxes[1].hasAttribute('checked'), true);
});

test('fenced code is syntax highlighted', () => {
  const html = render('```js\nconst a = 1;\n```');
  assert.match(html, /class="[^"]*hljs-keyword/);
  assert.match(html, /class="[^"]*language-js/);
});

test('math renders, but not inside code or plain prices', () => {
  const dom = toDom(render([
    'Energy $E = mc^2$ inline.',
    '',
    '$$\n\\int_0^1 x\\,dx\n$$',
    '',
    'It costs $5 and $10 today.',
    '',
    '```sh\necho $HOME $PATH\n```'
  ].join('\n')));

  assert.equal(dom.querySelectorAll('.katex-inline .katex').length, 1);
  assert.equal(dom.querySelectorAll('.katex-block .katex-display').length, 1);
  assert.match(dom.textContent, /It costs \$5 and \$10 today\./);
  assert.match(dom.querySelector('pre code').textContent, /echo \$HOME \$PATH/);
});

test('callouts render for every supported type with title and body', () => {
  for (const type of ['NOTE', 'TIP', 'WARNING', 'CAUTION', 'IMPORTANT']) {
    const dom = toDom(render(`> [!${type}] Heads up\n> Body **bold** text`));
    const callout = dom.querySelector(`.callout.callout-${type.toLowerCase()}`);
    assert.ok(callout, `callout ${type} missing`);
    assert.match(callout.querySelector('.callout-header').textContent, /Heads up/);
    assert.equal(callout.querySelector('.callout-body strong').textContent, 'bold');
  }
});

test('callout without title falls back to the type name', () => {
  const dom = toDom(render('> [!TIP]\n> Just body'));
  assert.match(dom.querySelector('.callout-header').textContent, /TIP/);
  assert.match(dom.querySelector('.callout-body').textContent, /Just body/);
});

test('plain blockquotes stay blockquotes', () => {
  const dom = toDom(render('> just a quote'));
  assert.ok(dom.querySelector('blockquote'));
  assert.equal(dom.querySelector('.callout'), null);
});

test('callout markers inside code blocks are not transformed', () => {
  const dom = toDom(render('```\n> [!NOTE] literal\n```'));
  assert.equal(dom.querySelector('.callout'), null);
});

test('empty input renders empty string', () => {
  assert.equal(render(''), '');
});

test('notes cannot inject inline styles, ids or names (KaTeX keeps its styles)', () => {
  const dom = toDom(render([
    '<div style="position:fixed;inset:0" id="app" name="x">overlay</div>',
    '',
    'Math $x^2$ here.'
  ].join('\n')));
  const div = [...dom.querySelectorAll('div')].find(d => d.textContent === 'overlay');
  assert.ok(div);
  assert.equal(div.getAttribute('style'), null);
  assert.equal(div.getAttribute('id'), null);
  assert.equal(div.getAttribute('name'), null);
  assert.ok(dom.querySelector('.katex [style]'), 'KaTeX layout styles must survive');
});

test('only markdown task checkboxes are marked as tasks', () => {
  const dom = toDom(render('<input type="checkbox">\n\n- [ ] real task'));
  const all = dom.querySelectorAll('input[type="checkbox"]');
  const tasks = dom.querySelectorAll('input[type="checkbox"][data-task]');
  assert.equal(all.length, 2);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].closest('li').textContent.trim(), 'real task');
});

test('toggleTaskCheckbox index always matches the rendered checkbox order', () => {
  const samples = [
    '- [ ]\n- [ ] real task',
    '* [x]\n- [ ] b\n- [ ] c',
    '- [ ]\ttab\n- [ ] after tab',
    '- [ ]   \n- [ ] after spaces',
    '> - [ ] quoted\n1. [ ] numbered\n2) [ ] paren',
    '```\n- [ ] in code\n```\n- [ ] outside'
  ];
  for (const md of samples) {
    const count = toDom(render(md)).querySelectorAll('input[data-task]').length;
    for (let i = 0; i < count; i++) {
      const checked = [...toDom(render(toggleTaskCheckbox(md.replace(/\[x\]/g, '[ ]'), i, true))).querySelectorAll('input[data-task]')]
        .map(box => box.checked);
      assert.deepEqual(checked, checked.map((_, j) => j === i), `${JSON.stringify(md)} index ${i}`);
    }
  }
});
