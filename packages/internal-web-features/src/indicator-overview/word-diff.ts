import { diffWordsWithSpace } from 'diff';

/** A run of text that two versions share, or that one of them adds or removes. */
export interface DiffRun {
  change: 'added' | 'removed' | 'unchanged';
  text: string;
}

/** A removed and an added run for the text pending, leaving out either that is empty. */
function changeRuns(removed: string, added: string): DiffRun[] {
  const runs: DiffRun[] = [
    { change: 'removed', text: removed },
    { change: 'added', text: added },
  ];
  return runs.filter(({ text }) => text !== '');
}

/**
 * The runs with each stretch of changes gathered into one removed run and one added run. A space
 * between words that were both removed and added belongs to the change, so a phrase replaced word
 * for word reads as one phrase removed and one added.
 */
function grouped(all: readonly DiffRun[]): DiffRun[] {
  const runs: DiffRun[] = [];
  let removed = '';
  let added = '';

  all.forEach((run, index) => {
    const next = all[index + 1];
    if (run.change === 'removed') {
      removed += run.text;
    } else if (run.change === 'added') {
      added += run.text;
    } else if (
      removed !== '' &&
      added !== '' &&
      run.text.trim() === '' &&
      next !== undefined &&
      next.change !== 'unchanged'
    ) {
      removed += run.text;
      added += run.text;
    } else {
      runs.push(...changeRuns(removed, added), run);
      removed = '';
      added = '';
    }
  });

  return [...runs, ...changeRuns(removed, added)];
}

/**
 * The runs of words that turn `before` into `after`, in reading order: what stays the same, what
 * is removed and what is added. Spaces are compared as well as words, so joining the unchanged and
 * removed runs gives `before` exactly, and joining the unchanged and added runs gives `after`.
 */
export function wordDiff(before: string, after: string): DiffRun[] {
  return grouped(
    diffWordsWithSpace(before, after).map(({ added, removed, value }) => ({
      change: added ? 'added' : removed ? 'removed' : 'unchanged',
      text: value,
    })),
  );
}
