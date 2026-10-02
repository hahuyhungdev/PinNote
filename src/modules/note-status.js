/**
 * PinNote - Note status labels (status itself lives in each note's YAML front-matter)
 */

export const STATUS_LABELS = {
  todo: 'To do',
  doing: 'Doing',
  waiting: 'Waiting',
  done: 'Done'
};

// Statuses that still need attention; "done" and no status are not open
export const isOpenStatus = (status) => status === 'todo' || status === 'doing' || status === 'waiting';
