/**
 * PinNote - Preview helpers (renderer side)
 * Markdown is parsed and sanitized in the preload bridge; this module only decorates the DOM.
 */

const COPY_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

const md = () => window.pinNoteMarkdown;

export const renderMarkdown = (raw) => md().render(raw);
export const toggleTaskCheckbox = (text, index, checked) => md().toggleTaskCheckbox(text, index, checked);
export const extractTags = (text) => md().extractTags(text);
export const flattenNoteFiles = (items) => md().flattenNoteFiles(items);
export const noteTitle = (name) => md().noteTitle(name);
export const resolveWikiLink = (files, link) => md().resolveWikiLink(files, link);

/**
 * Attach copy buttons to all <pre> code blocks in a rendered container
 */
export function attachCodeCopyButtons(container) {
  if (!container) return;
  container.querySelectorAll('pre').forEach(pre => {
    if (pre.querySelector('.copy-code-btn')) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'copy-code-btn';
    btn.title = 'Copy code snippet';
    btn.innerHTML = `${COPY_ICON}<span>Copy</span>`;

    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const code = pre.querySelector('code');
      const label = btn.querySelector('span');
      try {
        await navigator.clipboard.writeText(code ? code.innerText : pre.innerText);
        label.textContent = 'Copied!';
        btn.classList.add('copied');
      } catch (err) {
        label.textContent = 'Copy failed';
      }
      setTimeout(() => {
        label.textContent = 'Copy';
        btn.classList.remove('copied');
      }, 1600);
    });

    pre.appendChild(btn);
  });
}

/**
 * Wire up checkbox toggles, wiki links and copy buttons on a freshly rendered preview
 */
export function enhancePreview(container, { getSource, onSourceChange, onWikiLink }) {
  container.querySelectorAll('input[type="checkbox"][data-task]').forEach((checkbox, idx) => {
    checkbox.addEventListener('change', () => {
      onSourceChange(toggleTaskCheckbox(getSource(), idx, checkbox.checked));
    });
  });

  if (onWikiLink) {
    container.querySelectorAll('.wiki-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        onWikiLink(link.getAttribute('data-target'));
      });
    });
  }

  attachCodeCopyButtons(container);
}
