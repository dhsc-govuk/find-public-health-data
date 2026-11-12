import { type Database, schema } from '@fphd/db';
import type { IndicatorSubmissionStatus } from '@fphd/utils/indicator-submission-status';
import type { FlaggableTaskKey } from '@fphd/utils/indicator-task-key';
import type { ReviewResponseKind } from '@fphd/utils/review-response-kind';
import { eq, sql } from 'drizzle-orm';

import type { UpdateChange } from './indicator-history-contract.ts';
import { draftJoin, draftVersion } from './indicator-repository-sql.ts';

const { indicator } = schema;

// Timestamps arrive as the JSON text Postgres writes; dates as `YYYY-MM-DD`.

export interface HistoryVersionRecord {
  createdAt: string;
  createdBy: string;
  publishedAt: string | null;
}

export interface HistoryResponseRecord {
  reviewer: string;
  kind: ReviewResponseKind;
  imrgReviewedOn: string | null;
  clarificationRequest: string | null;
  respondedAt: string;
  flags: { task: FlaggableTaskKey; notes: string }[];
}

export interface HistorySubmissionRecord {
  versionId: string;
  status: IndicatorSubmissionStatus;
  /** The status of the version's submission before this one, or null for its first. */
  previousStatus: IndicatorSubmissionStatus | null;
  submittedAt: string;
  submittedBy: string;
  endedAt: string | null;
  endedBy: string | null;
  revisionResponse: string | null;
  /** What an update changed, kept when it was submitted; null for a new indicator's submission. */
  updateChanges: UpdateChange[] | null;
  responses: HistoryResponseRecord[];
}

export interface HistoryAssignmentRecord {
  at: string;
  by: string;
  reviewers: string[];
}

/** An admin confirming the publication date, or changing it once confirmed. */
export interface HistorySchedulingRecord {
  at: string;
  by: string;
  action: 'indicator.publication_scheduled' | 'indicator.publication_date_changed';
}

/** A publisher opening a draft of the live indicator to update it. */
export interface HistoryUpdateRecord {
  at: string;
  by: string;
}

/** A save of the draft after a response asked for changes: the fields it changed, never their values. */
export interface HistorySaveRecord {
  at: string;
  action: 'indicator.draft_updated' | 'indicator.data_table_confirmed';
  fields: string[];
  /** For a data table confirmation, whether new data had cleared the previous one. */
  reloaded: boolean;
}

export interface IndicatorHistoryRow {
  versions: HistoryVersionRecord[];
  submissions: HistorySubmissionRecord[];
  assignments: HistoryAssignmentRecord[];
  scheduling: HistorySchedulingRecord[];
  updates: HistoryUpdateRecord[];
  saves: HistorySaveRecord[];
}

const versions = sql<HistoryVersionRecord[]>`coalesce((
  select json_agg(json_build_object(
    'createdAt', v.created_at,
    'createdBy', u.display_name,
    'publishedAt', v.published_at
  ) order by v.created_at, v.id)
  from indicator_version v
  join app_user u on u.id = v.created_by
  where v.indicator_id = ${indicator.id}
), '[]'::json)`;

const submissions = sql<HistorySubmissionRecord[]>`coalesce((
  select json_agg(json_build_object(
    'versionId', s.indicator_version_id,
    'status', s.status,
    'previousStatus', s.previous_status,
    'submittedAt', s.submitted_at,
    'submittedBy', submitter.display_name,
    'endedAt', s.ended_at,
    'endedBy', ender.display_name,
    'revisionResponse', s.revision_response,
    'updateChanges', s.update_changes,
    'responses', coalesce((
      select json_agg(json_build_object(
        'reviewer', reviewer.display_name,
        'kind', r.kind,
        'imrgReviewedOn', r.imrg_reviewed_on,
        'clarificationRequest', r.clarification_request,
        'respondedAt', r.responded_at,
        'flags', coalesce((
          select json_agg(json_build_object('task', f.task_key, 'notes', f.notes))
          from indicator_version_submission_flag f
          where f.response_id = r.id
        ), '[]'::json)
      ) order by r.responded_at)
      from indicator_version_submission_response r
      join app_user reviewer on reviewer.id = r.reviewer_id
      where r.submission_id = s.id
    ), '[]'::json)
  ) order by s.submitted_at)
  from (
    select *, lag(status) over (partition by indicator_version_id order by number) as previous_status
    from indicator_version_submission
    where indicator_id = ${indicator.id}
  ) s
  join app_user submitter on submitter.id = s.submitted_by
  left join app_user ender on ender.id = s.ended_by
), '[]'::json)`;

// The audit log keeps every assignment and change of reviewers; the reviewer rows only the last.
// The entity index finds the indicator's entries, tens to hundreds, and the action narrows them
// before any entry's changes are read.
const assignments = sql<HistoryAssignmentRecord[]>`coalesce((
  select json_agg(json_build_object(
    'at', a.occurred_at,
    'by', actor.display_name,
    'reviewers', coalesce((
      select json_agg(reviewer.display_name order by reviewer.display_name, reviewer.id)
      from jsonb_array_elements_text(a.changes -> 'reviewerIds' -> 'after') as assigned(id)
      join app_user reviewer on reviewer.id = assigned.id::uuid
    ), '[]'::json)
  ) order by a.occurred_at) filter (where a.changes -> 'reviewerIds' is not null)
  from audit_log a
  join app_user actor on actor.id = a.actor_id
  where a.action = 'indicator.reviewers_assigned'
    and a.entity_type = 'indicator'
    and a.entity_id = ${indicator.id}::text
), '[]'::json)`;

// Who confirmed or changed the publication date, and when; never the date. The entity index finds
// the indicator's entries and the action narrows them, as for the assignments.
const scheduling = sql<HistorySchedulingRecord[]>`coalesce((
  select json_agg(json_build_object(
    'at', a.occurred_at,
    'by', actor.display_name,
    'action', a.action
  ) order by a.occurred_at)
  from audit_log a
  join app_user actor on actor.id = a.actor_id
  where a.action in ('indicator.publication_scheduled', 'indicator.publication_date_changed')
    and a.entity_type = 'indicator'
    and a.entity_id = ${indicator.id}::text
), '[]'::json)`;

// Who opened each draft of the live indicator to update it, and when. The entity index finds the
// indicator's entries and the action narrows them, as for the assignments.
const updates = sql<HistoryUpdateRecord[]>`coalesce((
  select json_agg(json_build_object(
    'at', a.occurred_at,
    'by', actor.display_name
  ) order by a.occurred_at)
  from audit_log a
  join app_user actor on actor.id = a.actor_id
  where a.action = 'indicator.draft_created_from_published'
    and a.entity_type = 'indicator'
    and a.entity_id = ${indicator.id}::text
), '[]'::json)`;

// Only the field names: the values are the draft's, which this history never shows. The entity
// index finds the indicator's entries and the action narrows them, as for the assignments.
const saves = sql<HistorySaveRecord[]>`coalesce((
  select json_agg(json_build_object(
    'at', a.occurred_at,
    'action', a.action,
    'fields', (select coalesce(json_agg(field), '[]'::json) from jsonb_object_keys(a.changes) field),
    'reloaded', a.action = 'indicator.data_table_confirmed'
      and a.changes -> 'dataTableConfirmedAt' -> 'before' = 'null'::jsonb
  ) order by a.occurred_at)
  from audit_log a
  where a.action in ('indicator.draft_updated', 'indicator.data_table_confirmed')
    and a.entity_type = 'indicator'
    and a.entity_id = ${indicator.id}::text
    and a.occurred_at > (
      select min(r.responded_at)
      from indicator_version_submission_response r
      join indicator_version_submission s on s.id = r.submission_id
      where s.indicator_id = ${indicator.id} and s.status = 'changes_requested'
    )
), '[]'::json)`;

/**
 * Everything the indicator's history is made from, in one statement, or undefined when there is
 * no such indicator. It reads only the audit actions it names, so reviewers' notes, which the
 * publisher may not read, never reach it.
 */
export async function findIndicatorHistory(
  db: Database,
  id: string,
): Promise<IndicatorHistoryRow | undefined> {
  const [row] = await db
    .select({
      versions,
      submissions,
      assignments,
      scheduling,
      updates,
      saves,
    })
    .from(indicator)
    .leftJoin(draftVersion, draftJoin)
    .where(eq(indicator.id, id));

  return row;
}
