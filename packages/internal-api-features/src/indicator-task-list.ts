import { isDeepStrictEqual } from 'node:util';

import { draftTaskKeys } from '@fphd/utils/indicator-task-key';

import {
  agesSection,
  benchmarkingSection,
  type CiMethodKind,
  calculationSection,
  confidenceIntervalsSectionFor,
  copyrightAndDataReuseSection,
  dataQualitySection,
  definitionAndRationaleSection,
  denominatorSection,
  type IndicatorSection,
  type IndicatorTaskKey,
  type IndicatorTaskList,
  type IndicatorTaskListReview,
  type IndicatorTaskStatus,
  type IndicatorTaskStatuses,
  justificationsSection,
  numeratorSection,
  otherCommentsSection,
  otherNotesAndCaveatsSection,
  periodTypeSection,
  polaritySection,
  publishingDateSection,
  revisionKindSchema,
  sexGenderAndEthnicitySection,
  taggingSection,
  updateFrequencySection,
  updateSummarySection,
  valueTypeAndUnitsSection,
  varianceAndQualitySection,
} from './contract.ts';
import type { IndicatorDraftVersion } from './indicator-draft-repository.ts';
import type { IndicatorSectionColumns, IndicatorSectionDraft } from './indicator-section.ts';
import {
  benchmarkingColumns,
  calculationColumns,
  confidenceIntervalsColumns,
  copyrightAndDataReuseColumns,
  dataQualityColumns,
  definitionAndRationaleColumns,
  justificationsColumns,
  otherCommentsColumns,
  otherNotesAndCaveatsColumns,
  periodTypeColumns,
  polarityColumns,
  publishingDateColumns,
  sexGenderAndEthnicityColumns,
  updateFrequencyColumns,
  updateSummaryColumns,
  valueTypeAndUnitsColumns,
  varianceAndQualityColumns,
} from './indicator-section-columns.ts';
import {
  agesColumns,
  denominatorColumns,
  numeratorColumns,
  taggingColumns,
} from './indicator-section-list-columns.ts';
import type { RevisionRoundRow } from './revision-response-repository.ts';

/** A version's answers to the tasks: its name, and the columns the data table and sections read. */
export type IndicatorTaskAnswers = Pick<IndicatorDraftVersion, 'name'> & IndicatorSectionDraft;

/** The draft columns the task list judges, and what its CI method asks for. */
export type IndicatorTaskListDraft = IndicatorTaskAnswers & {
  /** The kind of the draft's CI method, null while none is chosen. */
  ciMethodKind: CiMethodKind | null;
};

/** The task list as the draft's answers decide it; the route adds where it stands in review. */
export type IndicatorTaskListTasks = Omit<
  IndicatorTaskList,
  'draftUpdatedAt' | 'editable' | 'actions'
>;

export interface IndicatorTaskListSource {
  indicator: Omit<IndicatorTaskList['indicator'], 'name'>;
  draft: IndicatorTaskListDraft;
  /** The published version's answers, which an update's tasks are compared with; null with none. */
  published: IndicatorTaskAnswers | null;
  review: IndicatorTaskListReview | null;
}

/** The round that sent the draft back, as the task list shows it; null unless one has. */
export function taskListReview(
  round: RevisionRoundRow | undefined,
): IndicatorTaskListReview | null {
  const kind = revisionKindSchema.safeParse(round?.kind);

  if (round?.submissionStatus !== 'changes_requested' || !kind.success) return null;

  return {
    kind: kind.data,
    clarificationRequest: round.clarificationRequest,
    flags: round.flags,
    revisionResponse: round.revisionResponse,
  };
}

/** Whether the round's flags are all saved and its reply written, so it may be resubmitted. */
function isAnswered({ flags, revisionResponse }: IndicatorTaskListReview): boolean {
  return flags.every(({ cleared }) => cleared) && (revisionResponse ?? '').trim() !== '';
}

/** Loaded but not yet confirmed on the check page is in progress. */
function dataTableStatus({
  uploadBatchId,
  dataTableConfirmedAt,
}: Pick<IndicatorTaskListDraft, 'uploadBatchId' | 'dataTableConfirmedAt'>): IndicatorTaskStatus {
  if (dataTableConfirmedAt !== null) return 'completed';
  return uploadBatchId === null ? 'not_started' : 'in_progress';
}

/** Where each task on a draft stands. A section is complete once its form would accept its answers. */
function taskStatuses(draft: IndicatorTaskListDraft): IndicatorTaskStatuses {
  const complete = <Field extends string, Input, ErrorField extends string, Answers>(
    section: IndicatorSection<Field, unknown, Input, ErrorField, Answers>,
    columns: IndicatorSectionColumns<Field, never, Answers>,
  ): IndicatorTaskStatus =>
    section.schema.safeParse(section.formValues(columns.fromDraft(draft))).success
      ? 'completed'
      : 'not_started';

  // A draft is created by the page that asks for a name, so it always has one.
  return {
    name: 'completed',
    'data-table': dataTableStatus(draft),
    'definition-and-rationale': complete(
      definitionAndRationaleSection,
      definitionAndRationaleColumns,
    ),
    'period-type': complete(periodTypeSection, periodTypeColumns),
    polarity: complete(polaritySection, polarityColumns),
    'data-quality': complete(dataQualitySection, dataQualityColumns),
    numerator: complete(numeratorSection, numeratorColumns),
    denominator: complete(denominatorSection, denominatorColumns),
    calculation: complete(calculationSection, calculationColumns),
    'confidence-intervals': complete(
      confidenceIntervalsSectionFor(draft.ciMethodKind),
      confidenceIntervalsColumns,
    ),
    'update-frequency': complete(updateFrequencySection, updateFrequencyColumns),
    'value-type-and-units': complete(valueTypeAndUnitsSection, valueTypeAndUnitsColumns),
    'other-notes-and-caveats': complete(otherNotesAndCaveatsSection, otherNotesAndCaveatsColumns),
    'publishing-date': complete(publishingDateSection, publishingDateColumns),
    'variance-and-quality': complete(varianceAndQualitySection, varianceAndQualityColumns),
    justifications: complete(justificationsSection, justificationsColumns),
    'other-comments': complete(otherCommentsSection, otherCommentsColumns),
    'copyright-and-data-reuse': complete(
      copyrightAndDataReuseSection,
      copyrightAndDataReuseColumns,
    ),
    benchmarking: complete(benchmarkingSection, benchmarkingColumns),
    'sex-gender-and-ethnicity': complete(
      sexGenderAndEthnicitySection,
      sexGenderAndEthnicityColumns,
    ),
    ages: complete(agesSection, agesColumns),
    tagging: complete(taggingSection, taggingColumns),
    'update-summary': complete(updateSummarySection, updateSummaryColumns),
  };
}

/** Whether every task the draft has is complete: the update summary only counts on an update. */
function allCompleted(tasks: IndicatorTaskStatuses, isUpdate: boolean): boolean {
  return draftTaskKeys(isUpdate).every((key) => tasks[key] === 'completed');
}

/** True once every task on a new indicator's draft is complete, so it may be submitted. */
export function isDraftComplete(draft: IndicatorTaskListDraft): boolean {
  return allCompleted(taskStatuses(draft), false);
}

/**
 * The tasks an update compares with the published version, and the answers each compares. Every
 * update answers the publishing date and the update summary afresh, so neither is compared. The
 * data table is changed once the draft has a table of its own in place of the published one.
 */
const COMPARED_ANSWERS: Readonly<
  Record<
    Exclude<IndicatorTaskKey, 'publishing-date' | 'update-summary'>,
    (version: IndicatorTaskAnswers) => unknown
  >
> = {
  name: ({ name }) => name,
  'data-table': ({ uploadBatchId }) => uploadBatchId,
  'definition-and-rationale': definitionAndRationaleColumns.fromDraft,
  'period-type': periodTypeColumns.fromDraft,
  polarity: polarityColumns.fromDraft,
  'data-quality': dataQualityColumns.fromDraft,
  numerator: numeratorColumns.fromDraft,
  denominator: denominatorColumns.fromDraft,
  calculation: calculationColumns.fromDraft,
  'confidence-intervals': confidenceIntervalsColumns.fromDraft,
  'update-frequency': updateFrequencyColumns.fromDraft,
  'value-type-and-units': valueTypeAndUnitsColumns.fromDraft,
  'other-notes-and-caveats': otherNotesAndCaveatsColumns.fromDraft,
  'variance-and-quality': varianceAndQualityColumns.fromDraft,
  justifications: justificationsColumns.fromDraft,
  'other-comments': otherCommentsColumns.fromDraft,
  'copyright-and-data-reuse': copyrightAndDataReuseColumns.fromDraft,
  benchmarking: benchmarkingColumns.fromDraft,
  'sex-gender-and-ethnicity': sexGenderAndEthnicityColumns.fromDraft,
  ages: agesColumns.fromDraft,
  tagging: taggingColumns.fromDraft,
};

/** The tasks whose answers on the draft differ from the published version's. */
function changedTasks(
  draft: IndicatorTaskAnswers,
  published: IndicatorTaskAnswers | null,
): IndicatorTaskKey[] {
  if (published === null) return [];

  return Object.entries(COMPARED_ANSWERS)
    .filter(([, answersOf]) => !isDeepStrictEqual(answersOf(draft), answersOf(published)))
    .map(([key]) => key as IndicatorTaskKey);
}

/** The task list state of one draft. */
export function indicatorTaskList({
  draft,
  indicator,
  published,
  review,
}: IndicatorTaskListSource): IndicatorTaskListTasks {
  const tasks = taskStatuses(draft);
  const isUpdate = indicator.indicatorStatus === 'live';

  return {
    indicator: { ...indicator, name: draft.name },
    isUpdate,
    canSubmit: allCompleted(tasks, isUpdate) && (review === null || isAnswered(review)),
    tasks,
    changedTasks: isUpdate ? changedTasks(draft, published) : [],
    review,
  };
}
