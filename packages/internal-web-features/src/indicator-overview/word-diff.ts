/** A run of text that two versions share, or that one of them adds or removes. */
export interface DiffRun {
  change: 'added' | 'removed' | 'unchanged';
  text: string;
}

/**
 * The runs of words that turn `before` into `after`, in reading order: what stays the same, what
 * is removed and what is added. Joining the unchanged and removed runs gives `before`, and
 * joining the unchanged and added runs gives `after`.
 *
 * This version replaces the whole text whenever it changes. A word-by-word comparison takes its
 * place once the choice between a package and our own is made.
 */
export function wordDiff(before: string, after: string): DiffRun[] {
  if (before === after) return after === '' ? [] : [{ change: 'unchanged', text: after }];

  const runs: DiffRun[] = [
    { change: 'removed', text: before },
    { change: 'added', text: after },
  ];
  return runs.filter(({ text }) => text !== '');
}
