/**
 * PinNote - Markdown Engine
 * Marked + Highlight.js + KaTeX + Obsidian callouts + wiki links, sanitized with DOMPurify.
 * Runs in the preload (isolated world) and in tests; the page itself never touches Node.
 */

const { Marked } = require('marked');
const hljs = require('highlight.js');
const katex = require('katex');
const createDOMPurify = require('dompurify');

const CALLOUT_TYPES = ['NOTE', 'TIP', 'WARNING', 'CAUTION', 'IMPORTANT'];
const CALLOUT_ICONS = {
  note: '📌',
  tip: '💡',
  warning: '⚠️',
  caution: '🚨',
  important: '⭐'
};

const AUTO_HIGHLIGHT_LIMIT = 4000;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderMath(tex, displayMode) {
  return katex.renderToString(tex.trim(), { displayMode, throwOnError: false });
}

const blockMath = {
  name: 'blockMath',
  level: 'block',
  start: (src) => src.match(/^\$\$/m)?.index,
  tokenizer(src) {
    const match = /^\$\$([\s\S]+?)\$\$[^\S\n]*(?:\n+|$)/.exec(src);
    if (match) return { type: 'blockMath', raw: match[0], text: match[1] };
  },
  renderer: (token) => `<div class="katex-block">${renderMath(token.text, true)}</div>\n`
};

// Inline math follows the Pandoc rule so prices like "$5 and $10" stay plain text:
// no space after the opening $, no space before the closing $, no digit right after it.
const inlineMath = {
  name: 'inlineMath',
  level: 'inline',
  start: (src) => src.indexOf('$'),
  tokenizer(src) {
    const display = /^\$\$([^$]+?)\$\$/.exec(src);
    if (display) return { type: 'inlineMath', raw: display[0], text: display[1], displayMode: true };
    const match = /^\$(?!\s)((?:\\\$|[^$\n])+?)(?<!\s)\$(?!\d)/.exec(src);
    if (match) return { type: 'inlineMath', raw: match[0], text: match[1], displayMode: false };
  },
  renderer: (token) => token.displayMode
    ? `<span class="katex-block">${renderMath(token.text, true)}</span>`
    : `<span class="katex-inline">${renderMath(token.text, false)}</span>`
};

const wikiLink = {
  name: 'wikiLink',
  level: 'inline',
  start: (src) => src.indexOf('[['),
  tokenizer(src) {
    const match = /^\[\[([^\]\n]+)\]\]/.exec(src);
    if (!match) return;
    // Obsidian syntax: [[Note]], [[Note|shown text]], [[Note#Heading]]
    // The full link is kept as the target: "#" may be a heading or part of a title like "Meeting #3"
    const [link, alias] = match[1].split('|');
    const target = link.trim();
    const label = alias?.trim() || target;
    return { type: 'wikiLink', raw: match[0], target, label };
  },
  renderer: (token) =>
    `<a href="#" class="wiki-link" data-target="${escapeHtml(token.target)}">${escapeHtml(token.label)}</a>`
};

const CALLOUT_RE = new RegExp(
  `^<p>\\[!(${CALLOUT_TYPES.join('|')})\\][ \\t]*(.*?)(<br>\\n?|\\n|</p>\\n?)`,
  'is'
);

const renderer = {
  // Mark markdown task checkboxes so the preview never confuses them with raw-HTML inputs
  checkbox(checked) {
    return `<input type="checkbox" data-task=""${checked ? ' checked=""' : ''}> `;
  },

  // marked v12 signature: code(code, infostring, escaped)
  code(code, infostring) {
    const lang = (infostring || '').match(/^\S*/)[0];
    let highlighted;
    let langClass = lang;

    if (lang && hljs.getLanguage(lang)) {
      highlighted = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
    } else if (!lang && code.length <= AUTO_HIGHLIGHT_LIMIT) {
      const auto = hljs.highlightAuto(code);
      highlighted = auto.value;
      langClass = auto.language || '';
    } else {
      highlighted = escapeHtml(code);
    }

    const cls = langClass ? ` language-${escapeHtml(langClass)}` : '';
    return `<pre><code class="hljs${cls}">${highlighted}</code></pre>\n`;
  },

  // Obsidian callouts: a blockquote whose first line is "[!TYPE] Optional title"
  blockquote(quote) {
    const match = CALLOUT_RE.exec(quote);
    if (!match) return `<blockquote>\n${quote}</blockquote>\n`;

    const type = match[1].toLowerCase();
    const title = match[2].trim() || type.toUpperCase();
    const rest = quote.slice(match[0].length);
    const body = (match[3].startsWith('<br>') ? `<p>${rest}` : rest)
      .replace(/<p>\s*<\/p>/g, '')
      .trim();

    return `<div class="callout callout-${type}">
<div class="callout-header"><span class="callout-icon" aria-hidden="true">${CALLOUT_ICONS[type]}</span><strong>${title}</strong></div>
${body ? `<div class="callout-body">${body}</div>` : ''}
</div>\n`;
  }
};

function createMarkedInstance() {
  const md = new Marked({ gfm: true, breaks: true });
  md.use({ extensions: [blockMath, inlineMath, wikiLink], renderer });
  return md;
}

function configurePurifier(purify) {
  purify.addHook('uponSanitizeElement', (node, data) => {
    // Notes may only contain task checkboxes, never other form controls
    if (data.tagName === 'input' && node.getAttribute('type') !== 'checkbox') {
      node.parentNode?.removeChild(node);
    }
  });
  purify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'INPUT') node.removeAttribute('disabled');
    // Inline styles are only needed for KaTeX layout; elsewhere they enable fake-UI overlays
    if (node.hasAttribute?.('style') && !node.closest?.('.katex')) node.removeAttribute('style');
  });
  return purify;
}

/**
 * Create a renderer bound to a DOM window (the preload's window, or jsdom in tests)
 */
function createMarkdownRenderer(window) {
  const md = createMarkedInstance();
  const purify = configurePurifier(createDOMPurify(window));

  function render(rawMarkdown) {
    if (!rawMarkdown) return '';
    const html = md.parse(rawMarkdown);
    return purify.sanitize(html, {
      FORBID_TAGS: ['style', 'form', 'button', 'textarea', 'select', 'option', 'iframe', 'object', 'embed'],
      FORBID_ATTR: ['formaction', 'srcdoc', 'id', 'name']
    });
  }

  return { render };
}

module.exports = { createMarkdownRenderer, escapeHtml };
