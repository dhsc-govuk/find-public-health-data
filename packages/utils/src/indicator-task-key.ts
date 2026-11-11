import { isOneOf } from './is-one-of.ts';

/** The tasks a publisher completes on an indicator's draft: the name, the data table and each section. */
export const INDICATOR_TASK_KEYS = [
  'name',
  'data-table',
  'definition-and-rationale',
  'polarity',
  'data-quality',
  'numerator',
  'denominator',
  'calculation',
  'confidence-intervals',
  'update-frequency',
  'value-type-and-units',
  'period-type',
  'other-notes-and-caveats',
  'publishing-date',
  'variance-and-quality',
  'justifications',
  'other-comments',
  'copyright-and-data-reuse',
  'benchmarking',
  'sex-and-ages',
  'ages',
  'tagging',
] as const;

export type IndicatorTaskKey = (typeof INDICATOR_TASK_KEYS)[number];

/** The notes for reviewers' sections, which a reviewer reads rather than flags. */
const NOTES_FOR_REVIEWERS_TASK_KEYS = [
  'variance-and-quality',
  'justifications',
  'other-comments',
] as const satisfies readonly IndicatorTaskKey[];

type NotesForReviewersTaskKey = (typeof NOTES_FOR_REVIEWERS_TASK_KEYS)[number];

export type FlaggableTaskKey = Exclude<IndicatorTaskKey, NotesForReviewersTaskKey>;

/** Whether a reviewer may flag the task: every task but the notes for reviewers. */
export function isFlaggable(key: IndicatorTaskKey): key is FlaggableTaskKey {
  return !isOneOf(NOTES_FOR_REVIEWERS_TASK_KEYS, key);
}

/** The tasks a reviewer may flag for revision: every task but the notes for reviewers. */
export const FLAGGABLE_TASK_KEYS: readonly FlaggableTaskKey[] =
  INDICATOR_TASK_KEYS.filter(isFlaggable);
