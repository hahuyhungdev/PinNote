/**
 * PinNote - Note History Module
 * Handles snapshot recording, history fetching, and timestamp formatting
 */

function formatRelativeTime(timestamp) {
  if (!timestamp) return 'Unknown';
  const diff = Date.now() - timestamp;
  const sec = Math.floor(diff / 1000);
  if (sec < 45) return 'Just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;

  const date = new Date(timestamp);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const mins = String(date.getMinutes()).padStart(2, '0');
  return `${day}-${month} ${hours}:${mins}`;
}

function formatExactTime(timestamp) {
  if (!timestamp) return 'Unknown';
  const date = new Date(timestamp);
  return date.toLocaleString();
}

async function recordNoteSnapshot(filePath, content, force = false) {
  if (!window.pinNoteAPI?.saveNoteSnapshot || !filePath || typeof content !== 'string') return;
  try {
    await window.pinNoteAPI.saveNoteSnapshot(filePath, content, force);
  } catch (err) {
    console.warn('Failed to record note snapshot:', err);
  }
}

async function fetchNoteHistory(filePath) {
  if (!window.pinNoteAPI?.getNoteHistory || !filePath) return [];
  try {
    return await window.pinNoteAPI.getNoteHistory(filePath);
  } catch (err) {
    console.error('Failed to get note history:', err);
    return [];
  }
}

async function restoreNoteRevision(filePath, snapshotId) {
  if (!window.pinNoteAPI?.restoreNoteSnapshot || !filePath || !snapshotId) {
    throw new Error('Missing file path or snapshot id');
  }
  return await window.pinNoteAPI.restoreNoteSnapshot(filePath, snapshotId);
}

module.exports = {
  formatRelativeTime,
  formatExactTime,
  recordNoteSnapshot,
  fetchNoteHistory,
  restoreNoteRevision
};
