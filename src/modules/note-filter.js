/**
 * PinNote - Sidebar filtering (pure, DOM-free)
 * Builds the folder tree the sidebar shows for a status filter, #tag search and folder scope.
 */

import { isOpenStatus } from './note-status.js';

export const STATUS_FILTERS = ['all', 'open', 'todo', 'doing', 'waiting', 'done'];

export function matchesStatus(status, filter) {
  if (filter === 'all') return true;
  if (filter === 'open') return isOpenStatus(status);
  return status === filter;
}

const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });

export function findFolder(items = [], folderPath) {
  for (const item of items) {
    if (item.type !== 'directory') continue;
    if (item.path === folderPath) return item;
    const found = findFolder(item.children, folderPath);
    if (found) return found;
  }
  return null;
}

/** Folders from the vault root down to `folderPath` (empty when it does not exist) */
export function folderTrail(items = [], folderPath) {
  for (const item of items) {
    if (item.type !== 'directory') continue;
    if (item.path === folderPath) return [item];
    const rest = folderTrail(item.children, folderPath);
    if (rest.length) return [item, ...rest];
  }
  return [];
}

/**
 * @param {object} [options]
 * @param {string} [options.status] one of STATUS_FILTERS
 * @param {string[]|null} [options.tagMatches] note paths matching a #tag search
 * @param {string|null} [options.scope] folder path to narrow to; unknown paths mean the whole vault
 * @returns {Array} folders (with `count` of matching notes and filtered `children`) first, then notes
 */
export function buildTreeView(items = [], { status = 'all', tagMatches = null, scope = null } = {}) {
  const roots = (scope && findFolder(items, scope)?.children) || items;
  const tags = tagMatches ? new Set(tagMatches) : null;
  // Empty folders are worth showing only while nothing is being filtered out
  const keepEmpty = status === 'all' && !tags;

  const build = (nodes) => {
    const folders = [];
    const files = [];
    for (const node of nodes) {
      if (node.type === 'directory') {
        const children = build(node.children || []);
        const count = children.reduce((sum, c) => sum + (c.type === 'directory' ? c.count : 1), 0);
        if (count > 0 || keepEmpty) folders.push({ ...node, children, count });
      } else if (node.type === 'file' && matchesStatus(node.status, status) && (!tags || tags.has(node.path))) {
        files.push(node);
      }
    }
    return [...folders.sort(byName), ...files.sort(byName)];
  };

  return build(roots);
}

/** Number of notes per status filter, within `scope` when given */
export function countByStatus(items = [], scope = null) {
  const counts = Object.fromEntries(STATUS_FILTERS.map(f => [f, 0]));
  const walk = (nodes) => {
    for (const node of nodes) {
      if (node.type === 'directory') walk(node.children || []);
      else if (node.type === 'file') {
        for (const filter of STATUS_FILTERS) if (matchesStatus(node.status, filter)) counts[filter]++;
      }
    }
  };
  walk((scope && findFolder(items, scope)?.children) || items);
  return counts;
}
