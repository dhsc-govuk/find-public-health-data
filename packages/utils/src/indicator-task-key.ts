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
  'sex-gender-and-ethnicity',
  'ages',
  'tagging',
  'update-summary',
] as const;

export type IndicatorTaskKey = (typeof INDICATOR_TASK_KEYS)[number];

/** The tasks only an update to a live indicator has, which a new indicator's draft never shows. */
const UPDATE_TASK_KEYS = ['update-summary'] as const satisfies readonly IndicatorTaskKey[];

/** The tasks a draft has: every task on an update, and all but the update's own on a new one. */
export function draftTaskKeys(isUpdate: boolean): readonly IndicatorTaskKey[] {
  return isUpdate
    ? INDICATOR_TASK_KEYS
    : INDICATOR_TASK_KEYS.filter((key) => !isOneOf(UPDATE_TASK_KEYS, key));
}

/** The notes for reviewers' sections, which a reviewer reads rather than flags. */
const NOTES_FOR_REVIEWERS_TASK_KEYS = [
  'variance-and-quality',
  'justifications',
  'other-comments',
] as const satisfies readonly IndicatorTaskKey[];

type NotesForReviewersTaskKey = (typeof NOTES_FOR_REVIEWERS_TASK_KEYS)[number];

export type FlaggableTaskKey = Exclude<
  IndicatorTaskKey,
  NotesForReviewersTaskKey | (typeof UPDATE_TASK_KEYS)[number]
>;

/** Whether a reviewer may flag the task: any but the notes for reviewers and the update summary. */
export function isFlaggable(key: IndicatorTaskKey): key is FlaggableTaskKey {
  return !isOneOf(NOTES_FOR_REVIEWERS_TASK_KEYS, key) && !isOneOf(UPDATE_TASK_KEYS, key);
}

/** The tasks a reviewer may flag for revision, as `isFlaggable` decides. */
export const FLAGGABLE_TASK_KEYS: readonly FlaggableTaskKey[] =
  INDICATOR_TASK_KEYS.filter(isFlaggable);
