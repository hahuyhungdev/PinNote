/**
 * PinNote - Markdown Engine Module
 * Encapsulates Marked, Highlight.js, KaTeX, Callouts, Wiki-Links, and Task Checkboxes
 */

const { marked } = require('marked');
const hljs = require('highlight.js');
const katex = require('katex');

// Configure marked defaults
marked.setOptions({
  highlight: function(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang }).value;
      } catch (err) {}
    }
    return hljs.highlightAuto(code).value;
  },
  breaks: true,
  gfm: true
});

const CALLOUT_ICONS = {
  note: '📌',
  tip: '💡',
  warning: '⚠️',
  caution: '🚨',
  important: '⭐'
};

/**
 * Render raw Markdown text to rich HTML with KaTeX, Callouts, Wiki-Links, and interactive checkboxes
 */
function renderMarkdown(rawMarkdown) {
  if (!rawMarkdown) return '';

  let content = rawMarkdown;

  // 1. Math equations: block ($$ ... $$) and inline ($ ... $)
  content = content.replace(/\$\$([\s\S]+?)\$\$/g, (match, equation) => {
    try {
      return `<div class="katex-block">${katex.renderToString(equation.trim(), { displayMode: true, throwOnError: false })}</div>`;
    } catch (e) {
      return match;
    }
  });

  content = content.replace(/\$([^\$\n]+?)\$/g, (match, equation) => {
    try {
      return `<span class="katex-inline">${katex.renderToString(equation.trim(), { displayMode: false, throwOnError: false })}</span>`;
    } catch (e) {
      return match;
    }
  });

  // 2. Obsidian Callouts: > [!NOTE] Optional Title
  content = content.replace(/^>\s*\[!(NOTE|TIP|WARNING|CAUTION|IMPORTANT)\][ \t]*(.*(?:\n>.*)*)/gim, (match, type, rest) => {
    const lines = rest.split(/\r?\n>/);
    let title = lines[0].trim();
    let body = lines.slice(1).join('\n>').trim();

    if (!title && !body) {
      body = '';
    } else if (!body && title && title.length > 40) {
      body = title;
      title = '';
    }

    const typeLower = type.toLowerCase();
    const icon = CALLOUT_ICONS[typeLower] || '📌';
    const headerTitle = title || type.toUpperCase();
    const renderedBody = body ? marked.parse(body.replace(/^>\s?/gm, '')) : '';

    return `<div class="callout callout-${typeLower}">
      <div class="callout-header"><strong>${icon} ${headerTitle}</strong></div>
      ${renderedBody ? `<div class="callout-body">${renderedBody}</div>` : ''}
    </div>`;
  });

  // 3. Wiki Links: [[Note Title]]
  content = content.replace(/\[\[([^\]]+)\]\]/g, (match, noteTitle) => {
    return `<a href="#" class="wiki-link" data-target="${noteTitle}">${noteTitle}</a>`;
  });

  // 4. Parse with marked
  let html = marked.parse(content);

  // 5. Strip disabled="" from checkboxes so they are interactive
  html = html.replace(/<input\s+disabled=""\s+type="checkbox"/gi, '<input type="checkbox"');
  html = html.replace(/<input\s+checked=""\s+disabled=""\s+type="checkbox"/gi, '<input checked="" type="checkbox"');

  return html;
}

/**
 * Toggle a task checkbox in raw markdown text by its index
 */
function toggleTaskCheckbox(markdownText, checkboxIndex, isChecked) {
  const lines = markdownText.split('\n');
  let count = 0;

  for (let i = 0; i < lines.length; i++) {
    if (/^\s*([\-\*]|\d+\.)\s*\[[ xX]\]/.test(lines[i])) {
      if (count === checkboxIndex) {
        lines[i] = isChecked
          ? lines[i].replace(/\[ \]/, '[x]')
          : lines[i].replace(/\[[xX]\]/, '[ ]');
        break;
      }
      count++;
    }
  }

  return lines.join('\n');
}

/**
 * Extract #tags from note content
 */
function extractTags(markdownText) {
  if (!markdownText) return [];
  const tagMatches = markdownText.match(/#[a-zA-Z0-9_\-]+/g) || [];
  return [...new Set(tagMatches)];
}

/**
 * Attach copy code buttons to all <pre> code blocks in rendered container
 */
function attachCodeCopyButtons(container) {
  if (!container) return;
  container.querySelectorAll('pre').forEach(pre => {
    if (pre.querySelector('.copy-code-btn')) return;

    const btn = document.createElement('button');
    btn.className = 'copy-code-btn';
    btn.title = 'Copy code snippet';
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy`;

    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const code = pre.querySelector('code');
      const text = code ? code.innerText : pre.innerText;
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.innerHTML = `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy`;
          btn.classList.remove('copied');
        }, 1600);
      } catch (err) {}
    });

    pre.style.position = 'relative';
    pre.appendChild(btn);
  });
}

module.exports = {
  renderMarkdown,
  toggleTaskCheckbox,
  extractTags,
  attachCodeCopyButtons
};
