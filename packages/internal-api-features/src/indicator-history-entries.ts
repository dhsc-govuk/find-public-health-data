import { FLAGGABLE_TASK_KEYS, type FlaggableTaskKey } from '@fphd/utils/indicator-task-key';
import { ukInstant } from '@fphd/utils/uk-time';

import type { HistoryEntry } from './indicator-history-contract.ts';
import type {
  HistoryResponseRecord,
  HistorySaveRecord,
  HistorySchedulingRecord,
  HistorySubmissionRecord,
  IndicatorHistoryRow,
} from './indicator-history-repository.ts';
import { changesTask } from './indicator-task-audit-fields.ts';

type HistoryRecords = Pick<
  IndicatorHistoryRow,
  'versions' | 'submissions' | 'assignments' | 'scheduling' | 'updates' | 'saves'
>;

const SCHEDULING_KINDS = {
  'indicator.publication_scheduled': 'publication_scheduled',
  'indicator.publication_date_changed': 'publication_date_changed',
} as const satisfies Record<HistorySchedulingRecord['action'], HistoryEntry['kind']>;

/** An entry with the instant it sorts by. */
interface Dated {
  entry: HistoryEntry;
  sortsAt: number;
}

function iso(at: string): string {
  return new Date(at).toISOString();
}

function dated(entry: HistoryEntry, at: string): Dated {
  return { entry, sortsAt: new Date(at).getTime() };
}

function byTaskOrder<T extends { task: FlaggableTaskKey }>(flags: readonly T[]): T[] {
  return [...flags].sort(
    (a, b) => FLAGGABLE_TASK_KEYS.indexOf(a.task) - FLAGGABLE_TASK_KEYS.indexOf(b.task),
  );
}

// An IMRG meeting has a day but no time: it sorts at the end of that day, or just before the
// response that recorded it when the reviewer entered it the same day.
function imrgSortsAt(on: string, respondedAt: string): number {
  const [year = 0, month = 0, day = 0] = on.split('-').map(Number);
  const lastMinute = ukInstant({ year, month, day, hour: 23, minute: 59 });
  const endOfDay = (lastMinute?.getTime() ?? Number.POSITIVE_INFINITY) + 59_999;
  return Math.min(endOfDay, new Date(respondedAt).getTime());
}

function responseEntries(response: HistoryResponseRecord): Dated[] {
  const imrg: Dated[] =
    response.imrgReviewedOn === null
      ? []
      : [
          {
            entry: { kind: 'imrg_reviewed', on: response.imrgReviewedOn, by: response.reviewer },
            sortsAt: imrgSortsAt(response.imrgReviewedOn, response.respondedAt),
          },
        ];

  return [
    ...imrg,
    dated(
      {
        kind: 'responded',
        at: iso(response.respondedAt),
        by: response.reviewer,
        response: response.kind,
        flags: byTaskOrder(response.flags),
        clarificationRequest: response.clarificationRequest,
      },
      response.respondedAt,
    ),
  ];
}

/** Whether a save between the response and the resubmission revised the flagged task. */
function isRevised(
  task: FlaggableTaskKey,
  saves: readonly HistorySaveRecord[],
  from: string,
  until: string,
): boolean {
  const start = new Date(from).getTime();
  const end = new Date(until).getTime();

  return saves.some((save) => {
    const at = new Date(save.at).getTime();
    if (at <= start || at >= end) return false;
    if (task === 'data-table') return save.reloaded;
    return save.action === 'indicator.draft_updated' && changesTask(task, save.fields);
  });
}

function resubmissionEntry(
  submission: HistorySubmissionRecord,
  sentBack: HistorySubmissionRecord,
  saves: readonly HistorySaveRecord[],
): Dated {
  const flags = sentBack.responses.flatMap((response) =>
    response.flags.map(({ task }) => ({
      task,
      revised: isRevised(task, saves, response.respondedAt, submission.submittedAt),
    })),
  );

  return dated(
    {
      kind: 'resubmitted',
      at: iso(submission.submittedAt),
      by: submission.submittedBy,
      flags: byTaskOrder(flags),
      reply: sentBack.revisionResponse,
    },
    submission.submittedAt,
  );
}

function submissionEntries(
  submission: HistorySubmissionRecord,
  previous: HistorySubmissionRecord | undefined,
  saves: readonly HistorySaveRecord[],
): Dated[] {
  const sent =
    previous !== undefined && submission.previousStatus === 'changes_requested'
      ? resubmissionEntry(submission, previous, saves)
      : dated(
          { kind: 'submitted', at: iso(submission.submittedAt), by: submission.submittedBy },
          submission.submittedAt,
        );
  const withdrawn =
    submission.status === 'withdrawn' && submission.endedAt !== null && submission.endedBy !== null
      ? [
          dated(
            { kind: 'withdrawn', at: iso(submission.endedAt), by: submission.endedBy },
            submission.endedAt,
          ),
        ]
      : [];

  return [sent, ...submission.responses.flatMap(responseEntries), ...withdrawn];
}

function versionEntries({ versions }: HistoryRecords): Dated[] {
  const [first] = versions;
  // A migrated version was created when it was loaded, which can be after it was published.
  const created: Dated[] =
    first === undefined
      ? []
      : [
          [first.createdAt, first.publishedAt]
            .filter((at) => at !== null)
            .map((at) => dated({ kind: 'created', at: iso(at), by: first.createdBy }, at))
            .reduce((earliest, each) => (each.sortsAt < earliest.sortsAt ? each : earliest)),
        ];
  const published = versions.flatMap(({ publishedAt }) =>
    publishedAt === null
      ? []
      : [dated({ kind: 'published', at: iso(publishedAt), by: null }, publishedAt)],
  );

  return [...created, ...published];
}

/**
 * The indicator's history entries, newest first, from what the history statement read. Entries
 * at the same instant keep the order they happened in, the later first.
 */
export function historyEntries(records: HistoryRecords): HistoryEntry[] {
  const { submissions, assignments, scheduling, updates, saves } = records;
  const happened = [
    ...versionEntries(records),
    ...submissions.flatMap((submission, index) =>
      submissionEntries(
        submission,
        submissions.slice(0, index).findLast(({ versionId }) => versionId === submission.versionId),
        saves,
      ),
    ),
    ...assignments.map(({ at, by, reviewers }) =>
      dated({ kind: 'reviewers_assigned', at: iso(at), by, reviewers }, at),
    ),
    ...scheduling.map(({ at, by, action }) =>
      dated({ kind: SCHEDULING_KINDS[action], at: iso(at), by }, at),
    ),
    ...updates.map(({ at, by }) => dated({ kind: 'update_started', at: iso(at), by }, at)),
  ];

  return happened
    .map((each, order) => ({ ...each, order }))
    .sort((a, b) => b.sortsAt - a.sortsAt || b.order - a.order)
    .map(({ entry }) => entry);
}
