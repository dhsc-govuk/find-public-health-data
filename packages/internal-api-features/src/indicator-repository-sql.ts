import { type Database, schema } from '@fphd/db';
import { and, asc, desc, eq, max, sql } from 'drizzle-orm';
import { alias, QueryBuilder } from 'drizzle-orm/pg-core';

import type {
  DraftReviewer,
  DraftStatus,
  DraftSubmissionStatus,
  IndicatorStatus,
} from './contract.ts';

const {
  appUser,
  currentPublishedVersion,
  indicator,
  indicatorVersion,
  indicatorVersionSubmission,
  indicatorVersionSubmissionReviewer,
} = schema;

export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export const UNIQUE_VIOLATION = '23505';
// The slug exclusion constraint: another indicator already holds the slug this name yields.
export const EXCLUSION_VIOLATION = '23P01';

/** Drizzle wraps the driver error, so its fields are on a `cause` rather than the error thrown. */
function hasCause(error: unknown, field: 'code' | 'constraint_name', value: string): boolean {
  for (let current = error; current !== null && current !== undefined; ) {
    if (typeof current !== 'object') return false;
    if (field in current && (current as Record<string, unknown>)[field] === value) return true;
    current = (current as { cause?: unknown }).cause;
  }

  return false;
}

export function hasSqlState(error: unknown, sqlState: string): boolean {
  return hasCause(error, 'code', sqlState);
}

export function violatesConstraint(error: unknown, constraint: string): boolean {
  return hasCause(error, 'constraint_name', constraint);
}

/**
 * The one-draft index makes the draft join one row, and currentPublishedVersion is one row
 * per indicator, so an indicator's draft and published versions can be read side by side.
 * The view names the published version; its columns come from the version table by id.
 */
export const draftVersion = alias(indicatorVersion, 'draft_version');
export const publishedVersion = alias(indicatorVersion, 'published_version');
const firstVersion = alias(indicatorVersion, 'first_version');

export const draftJoin = and(
  eq(draftVersion.indicatorId, indicator.id),
  eq(draftVersion.status, 'draft'),
);
export const publishedJoin = eq(currentPublishedVersion.indicatorId, indicator.id);
export const publishedVersionJoin = eq(publishedVersion.id, currentPublishedVersion.id);

// The draft is what a publisher is working on, so it names the indicator while it exists.
export const currentName = sql<string>`coalesce(${draftVersion.name}, ${publishedVersion.name})`;
// greatest() ignores nulls, so an indicator with only one version still reports its date.
// mapWith, because a bare sql fragment arrives as the driver's string, not a Date.
export const latestUpdatedAt =
  sql`greatest(${draftVersion.updatedAt}, ${publishedVersion.updatedAt})`.mapWith(
    indicatorVersion.updatedAt,
  );
// Who made the edit latestUpdatedAt dates: the draft's editor on a tie, as it is the newer work.
export const latestUpdatedBy = sql<string | null>`case
  when ${publishedVersion.updatedAt} is null or ${draftVersion.updatedAt} >= ${publishedVersion.updatedAt}
  then ${draftVersion.updatedBy} else ${publishedVersion.updatedBy} end`;
// Both statuses are read from the versions as SQL, so a filter or sort on either is a WHERE clause.
export const indicatorStatus = sql<IndicatorStatus>`case when ${currentPublishedVersion.id} is not null then 'live' else 'new' end`;
// The draft join fixes the status it matches, which narrows the column from the version enum.
export const draftStatus = sql<DraftStatus | null>`${draftVersion.status}`;
export const draftLocked = sql<boolean>`coalesce(${draftVersion.isLocked}, false)`;
const latestDraftSubmission = new QueryBuilder({ casing: 'snake_case' })
  .select({ status: indicatorVersionSubmission.status })
  .from(indicatorVersionSubmission)
  .where(eq(indicatorVersionSubmission.indicatorVersionId, draftVersion.id))
  .orderBy(desc(indicatorVersionSubmission.number))
  .limit(1);
// A subquery, so a select list sorted and limited runs it for the rows it returns alone.
export const draftSubmissionStatus = sql<DraftSubmissionStatus | null>`(${latestDraftSubmission})`;
const latestDraftSubmissionNumber = new QueryBuilder({ casing: 'snake_case' })
  .select({ number: max(indicatorVersionSubmission.number) })
  .from(indicatorVersionSubmission)
  .where(eq(indicatorVersionSubmission.indicatorVersionId, draftVersion.id));
export const draftSubmissionNumber = sql<number | null>`(${latestDraftSubmissionNumber})`;
const latestDraftSubmittedAt = new QueryBuilder({ casing: 'snake_case' })
  .select({ submittedAt: indicatorVersionSubmission.submittedAt })
  .from(indicatorVersionSubmission)
  .where(eq(indicatorVersionSubmission.indicatorVersionId, draftVersion.id))
  .orderBy(desc(indicatorVersionSubmission.number))
  .limit(1);
export const draftSubmittedAt = sql`(${latestDraftSubmittedAt})`.mapWith(
  indicatorVersionSubmission.submittedAt,
);
const latestDraftSubmissionId = new QueryBuilder({ casing: 'snake_case' })
  .select({ id: indicatorVersionSubmission.id })
  .from(indicatorVersionSubmission)
  .where(eq(indicatorVersionSubmission.indicatorVersionId, draftVersion.id))
  .orderBy(desc(indicatorVersionSubmission.number))
  .limit(1);
export const draftSubmissionId = sql<string | null>`(${latestDraftSubmissionId})`;
export const draftReviewers = sql<DraftReviewer[]>`coalesce((
  select json_agg(json_build_object('id', ${appUser.id}, 'name', ${appUser.displayName})
    order by ${appUser.displayName}, ${appUser.id})
  from ${indicatorVersionSubmissionReviewer}
  join ${appUser} on ${appUser.id} = ${indicatorVersionSubmissionReviewer.reviewerId}
  where ${indicatorVersionSubmissionReviewer.submissionId} = ${draftSubmissionId}
), '[]'::json)`;
const firstVersionCreator = new QueryBuilder({ casing: 'snake_case' })
  .select({ createdBy: firstVersion.createdBy })
  .from(firstVersion)
  .where(eq(firstVersion.indicatorId, indicator.id))
  .orderBy(asc(firstVersion.createdAt), asc(firstVersion.id))
  .limit(1);
// Who wrote the indicator's first version, whatever has happened to it since: its creator.
export const indicatorCreatedBy = sql<string | null>`(${firstVersionCreator})`;
