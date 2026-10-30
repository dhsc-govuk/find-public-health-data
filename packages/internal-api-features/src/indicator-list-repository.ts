import type { IndicatorListScope } from '@fphd/auth/permissions';
import { type Database, schema } from '@fphd/db';
import { and, asc, count, desc, eq, inArray, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import type {
  DraftReviewer,
  DraftStatus,
  DraftSubmissionStatus,
  IndicatorStatus,
} from './contract.ts';
import {
  currentName,
  draftJoin,
  draftLocked,
  draftReviewers,
  draftStatus,
  draftSubmissionId,
  draftSubmissionNumber,
  draftSubmissionStatus,
  draftSubmittedAt,
  draftVersion,
  indicatorCreatedBy,
  indicatorStatus,
  latestUpdatedAt,
  latestUpdatedBy,
  publishedJoin,
  publishedVersion,
  publishedVersionJoin,
} from './indicator-repository-sql.ts';

const { appUser, currentPublishedVersion, indicator, indicatorVersionSubmissionReviewer, team } =
  schema;

const creator = alias(appUser, 'creator');
const lastEditor = alias(appUser, 'last_editor');

export interface IndicatorAdminRow {
  id: string;
  name: string;
  teamId: string | null;
  updatedAt: Date;
  indicatorStatus: IndicatorStatus;
  draftStatus: DraftStatus | null;
  draftLocked: boolean;
  draftSubmissionStatus: DraftSubmissionStatus | null;
  draftReviewers: DraftReviewer[];
}

/** A row of the dashboard, which names the team and the people as well as their ids. */
export interface IndicatorAdminListRow extends IndicatorAdminRow {
  teamName: string | null;
  createdBy: string | null;
  lastEditedBy: string | null;
}

export interface IndicatorAdminRows {
  indicators: IndicatorAdminListRow[];
  total: number;
}

/** The open submissions an IMRG manager works through, by whether reviewers are assigned. */
export interface IndicatorsUnderReviewRows {
  unassigned: IndicatorAdminListRow[];
  assigned: IndicatorAdminListRow[];
}

export interface IndicatorAdminDetailRow extends IndicatorAdminRow {
  shortId: number;
  /** The number of the draft's latest submission, null until the draft is first submitted. */
  draftSubmissionNumber: number | null;
  /** The published version's slug, and so its public address; null while none is published. */
  publishedSlug: string | null;
  /** When the draft asks to be published; null with no draft or no answer yet. */
  draftScheduledPublishAt: Date | null;
}

function scopeCondition(scope: IndicatorListScope): SQL | undefined {
  return scope.all ? undefined : inArray(indicator.teamId, [...scope.teamIds]);
}

function inNoTeams(scope: IndicatorListScope): boolean {
  return !scope.all && scope.teamIds.length === 0;
}

/**
 * The dashboard's rows, unfiltered and unsorted. The team and the people are joined into the
 * same query, and the creator is a select-list subquery, which Postgres runs after any sort and
 * limit, for the rows returned alone.
 */
function listRowsQuery(db: Database) {
  const createdBy = sql<string | null>`(${db
    .select({ name: creator.displayName })
    .from(creator)
    .where(eq(creator.id, indicatorCreatedBy))})`;

  return db
    .select({
      id: indicator.id,
      name: currentName,
      teamId: indicator.teamId,
      teamName: team.name,
      createdBy,
      updatedAt: latestUpdatedAt,
      lastEditedBy: lastEditor.displayName,
      indicatorStatus,
      draftStatus,
      draftLocked,
      draftSubmissionStatus,
      draftReviewers,
    })
    .from(indicator)
    .leftJoin(draftVersion, draftJoin)
    .leftJoin(currentPublishedVersion, publishedJoin)
    .leftJoin(publishedVersion, publishedVersionJoin)
    .leftJoin(team, eq(team.id, indicator.teamId))
    .leftJoin(lastEditor, eq(lastEditor.id, latestUpdatedBy));
}

/**
 * The indicators in scope whatever their status, newest edit first; the id breaks any remaining
 * tie. A page costs two queries, this and its count, however many rows it shows.
 */
export async function listIndicatorsPage(
  db: Database,
  page: number,
  pageSize: number,
  scope: IndicatorListScope,
): Promise<IndicatorAdminRows> {
  if (inNoTeams(scope)) return { indicators: [], total: 0 };

  const inScope = scopeCondition(scope);
  const [indicators, [counted]] = await Promise.all([
    listRowsQuery(db)
      .where(inScope)
      .orderBy(desc(latestUpdatedAt), asc(currentName), asc(indicator.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(indicator).where(inScope),
  ]);

  return { indicators, total: counted?.total ?? 0 };
}

/**
 * The indicators in scope whose draft's latest submission waits for reviewers or is in review,
 * oldest submission first, as a queue; the id breaks a tie.
 */
export async function listIndicatorsUnderReview(
  db: Database,
  scope: IndicatorListScope,
): Promise<IndicatorsUnderReviewRows> {
  if (inNoTeams(scope)) return { unassigned: [], assigned: [] };

  const rows = await listRowsQuery(db)
    .where(and(scopeCondition(scope), inArray(draftSubmissionStatus, ['submitted', 'in_review'])))
    .orderBy(asc(draftSubmittedAt), asc(indicator.id));

  return {
    unassigned: rows.filter((row) => row.draftSubmissionStatus === 'submitted'),
    assigned: rows.filter((row) => row.draftSubmissionStatus === 'in_review'),
  };
}

/**
 * The indicators whose draft's latest submission is in review with `reviewerId` among its
 * reviewers, oldest submission first, as a queue; the id breaks a tie.
 */
export async function listIndicatorsToReview(
  db: Database,
  reviewerId: string,
): Promise<IndicatorAdminListRow[]> {
  const assignedSubmissionIds = db
    .select({ id: indicatorVersionSubmissionReviewer.submissionId })
    .from(indicatorVersionSubmissionReviewer)
    .where(eq(indicatorVersionSubmissionReviewer.reviewerId, reviewerId));

  return listRowsQuery(db)
    .where(
      and(
        eq(draftSubmissionStatus, 'in_review'),
        inArray(draftSubmissionId, assignedSubmissionIds),
      ),
    )
    .orderBy(asc(draftSubmittedAt), asc(indicator.id));
}

/** One indicator by its row id, whatever its status. */
export async function getIndicatorById(
  db: Database,
  id: string,
): Promise<IndicatorAdminDetailRow | undefined> {
  const rows = await db
    .select({
      id: indicator.id,
      shortId: indicator.shortId,
      name: currentName,
      teamId: indicator.teamId,
      publishedSlug: publishedVersion.slug,
      updatedAt: latestUpdatedAt,
      indicatorStatus,
      draftStatus,
      draftLocked,
      draftSubmissionStatus,
      draftSubmissionNumber,
      draftReviewers,
      draftScheduledPublishAt: draftVersion.scheduledPublishAt,
    })
    .from(indicator)
    .leftJoin(draftVersion, draftJoin)
    .leftJoin(currentPublishedVersion, publishedJoin)
    .leftJoin(publishedVersion, publishedVersionJoin)
    .where(eq(indicator.id, id));

  return rows[0];
}

/** The team the indicator is in, null when it has none, or undefined when there is no such indicator. */
export async function findIndicatorTeamId(
  db: Database,
  id: string,
): Promise<string | null | undefined> {
  const [row] = await db
    .select({ teamId: indicator.teamId })
    .from(indicator)
    .where(eq(indicator.id, id));

  return row?.teamId;
}
