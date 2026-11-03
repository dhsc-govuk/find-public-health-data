import {
  benchmarkingSection,
  type CiMethodKind,
  calculationSection,
  confidenceIntervalsSectionFor,
  copyrightAndDataReuseSection,
  dataQualitySection,
  definitionAndRationaleSection,
  denominatorSection,
  type IndicatorSection,
  type IndicatorTaskList,
  type IndicatorTaskListReview,
  type IndicatorTaskStatus,
  type IndicatorTaskStatuses,
  justificationsSection,
  linksSection,
  numeratorSection,
  otherCommentsSection,
  otherNotesAndCaveatsSection,
  periodTypeSection,
  polaritySection,
  publishingDateSection,
  revisionKindSchema,
  sexAndAgesSection,
  taggingSection,
  updateFrequencySection,
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
  updateFrequencyColumns,
  valueTypeAndUnitsColumns,
  varianceAndQualityColumns,
} from './indicator-section-columns.ts';
import {
  denominatorColumns,
  linksColumns,
  numeratorColumns,
  sexAndAgesColumns,
  taggingColumns,
} from './indicator-section-list-columns.ts';
import type { RevisionRoundRow } from './revision-response-repository.ts';

/** The draft columns the task list judges: the name, the data table's, and those the sections read. */
export type IndicatorTaskListDraft = Pick<
  IndicatorDraftVersion,
  'name' | 'uploadBatchId' | 'dataTableConfirmedAt'
> &
  IndicatorSectionDraft & {
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
    links: complete(linksSection, linksColumns),
    'variance-and-quality': complete(varianceAndQualitySection, varianceAndQualityColumns),
    justifications: complete(justificationsSection, justificationsColumns),
    'other-comments': complete(otherCommentsSection, otherCommentsColumns),
    'copyright-and-data-reuse': complete(
      copyrightAndDataReuseSection,
      copyrightAndDataReuseColumns,
    ),
    benchmarking: complete(benchmarkingSection, benchmarkingColumns),
    'sex-and-ages': complete(sexAndAgesSection, sexAndAgesColumns),
    tagging: complete(taggingSection, taggingColumns),
  };
}

function allCompleted(tasks: IndicatorTaskStatuses): boolean {
  return Object.values(tasks).every((status) => status === 'completed');
}

/** True once every task on the draft is complete, so it may be submitted. */
export function isDraftComplete(draft: IndicatorTaskListDraft): boolean {
  return allCompleted(taskStatuses(draft));
}

/** The task list state of one draft. */
export function indicatorTaskList({
  draft,
  indicator,
  review,
}: IndicatorTaskListSource): IndicatorTaskListTasks {
  const tasks = taskStatuses(draft);

  return {
    indicator: { ...indicator, name: draft.name },
    isUpdate: indicator.indicatorStatus === 'live',
    canSubmit: allCompleted(tasks) && (review === null || isAnswered(review)),
    tasks,
    review,
  };
}
