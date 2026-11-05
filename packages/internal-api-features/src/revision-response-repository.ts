import { type Database, schema } from '@fphd/db';
import { type Actor, changesBetween, recordAudit } from '@fphd/db/audit-log';
import { and, desc, eq, sql } from 'drizzle-orm';
import { QueryBuilder } from 'drizzle-orm/pg-core';

import type {
  DraftSubmissionStatus,
  FlaggableTaskKey,
  ReviewerComment,
  ReviewResponseKind,
} from './contract.ts';
import { type EditPrecondition, editVersion } from './edit-version.ts';
import {
  draftJoin,
  draftResponseKind,
  draftSubmissionId,
  draftSubmissionNumber,
  draftSubmissionStatus,
  draftVersion,
} from './indicator-repository-sql.ts';

const {
  appUser,
  indicator,
  indicatorVersion,
  indicatorVersionSubmission,
  indicatorVersionSubmissionFlag,
  indicatorVersionSubmissionResponse,
  isUnpublished,
} = schema;

/** One flag of the round, and whether the publisher has saved its task since. */
export interface RevisionFlag extends ReviewerComment {
  task: FlaggableTaskKey;
  cleared: boolean;
}

/** Where the draft's latest round of review stands, as the publisher answers it. */
export interface RevisionRoundRow {
  hasDraft: boolean;
  draftLocked: boolean;
  /** The draft's latest submission, the round a reply answers; null until first submitted. */
  submissionNumber: number | null;
  submissionStatus: DraftSubmissionStatus | null;
  /** What the latest response to the round said, null until a reviewer responds. */
  kind: ReviewResponseKind | null;
  clarificationRequest: ReviewerComment | null;
  /** The publisher's reply to the round, null until written. */
  revisionResponse: string | null;
  flags: RevisionFlag[];
}

/**
 * The reply as the page edits it, with the round it answers, which its version is a hash of:
 * every round's reply starts empty, so a page shown in an earlier round never matches a later one.
 */
export interface RevisionReply {
  submissionNumber: number | null;
  revisionResponse: string | null;
}

export type SaveRevisionResponseResult =
  | { ok: true; version: string }
  | { ok: false; reason: 'no_draft' | 'locked' | 'not_allowed' }
  | { ok: false; reason: 'changed'; version: string };

const builder = new QueryBuilder({ casing: 'snake_case' });
const latestReply = builder
  .select({ reply: indicatorVersionSubmission.revisionResponse })
  .from(indicatorVersionSubmission)
  .where(eq(indicatorVersionSubmission.id, draftSubmissionId));
const latestClarification = builder
  .select({
    request: sql`case when ${indicatorVersionSubmissionResponse.clarificationRequest} is not null
      then json_build_object(
        'notes', ${indicatorVersionSubmissionResponse.clarificationRequest},
        'reviewerName', ${appUser.displayName}
      ) end`,
  })
  .from(indicatorVersionSubmissionResponse)
  .innerJoin(appUser, eq(appUser.id, indicatorVersionSubmissionResponse.reviewerId))
  .where(eq(indicatorVersionSubmissionResponse.submissionId, draftSubmissionId))
  .orderBy(desc(indicatorVersionSubmissionResponse.respondedAt))
  .limit(1);
const roundFlags = sql<RevisionFlag[]>`coalesce((
  select json_agg(json_build_object(
    'task', ${indicatorVersionSubmissionFlag.taskKey},
    'notes', ${indicatorVersionSubmissionFlag.notes},
    'reviewerName', ${appUser.displayName},
    'cleared', ${indicatorVersionSubmissionFlag.clearedAt} is not null
  ) order by ${indicatorVersionSubmissionFlag.taskKey})
  from ${indicatorVersionSubmissionFlag}
  join ${indicatorVersionSubmissionResponse}
    on ${indicatorVersionSubmissionResponse.id} = ${indicatorVersionSubmissionFlag.responseId}
  join ${appUser} on ${appUser.id} = ${indicatorVersionSubmissionResponse.reviewerId}
  where ${indicatorVersionSubmissionResponse.submissionId} = ${draftSubmissionId}
), '[]'::json)`;

/**
 * The draft's latest round of review: its status, the response's kind, clarification request and
 * flags with the names of the reviewers who wrote them, and the publisher's reply, read in one
 * statement. Undefined when there is no indicator.
 */
export async function getRevisionRound(
  db: Database,
  indicatorId: string,
): Promise<RevisionRoundRow | undefined> {
  const [row] = await db
    .select({
      draftId: draftVersion.id,
      draftLocked: sql<boolean>`coalesce(${draftVersion.isLocked}, false)`,
      submissionNumber: draftSubmissionNumber,
      submissionStatus: draftSubmissionStatus,
      kind: draftResponseKind,
      clarificationRequest: sql<ReviewerComment | null>`(${latestClarification})`,
      revisionResponse: sql<string | null>`(${latestReply})`,
      flags: roundFlags,
    })
    .from(indicator)
    .leftJoin(draftVersion, draftJoin)
    .where(eq(indicator.id, indicatorId));

  if (row === undefined) return undefined;

  const { draftId, ...round } = row;
  return { ...round, hasDraft: draftId !== null };
}

/**
 * Writes the publisher's reply to the round of review that sent the draft back. Writing it is an
 * edit of the draft, so it moves the draft's `updatedAt` and `updatedBy`, which a submission
 * confirms. Refused as `locked` while the draft is locked, `not_allowed` unless its latest
 * submission was sent back for changes, and `changed`, with the current version, when someone
 * has written the reply since the page was shown. A save answers the reply's new version.
 */
export function saveRevisionResponse(
  db: Database,
  indicatorId: string,
  text: string,
  precondition: EditPrecondition<RevisionReply>,
  actor: Actor,
): Promise<SaveRevisionResponseResult> {
  return db.transaction(async (tx): Promise<SaveRevisionResponseResult> => {
    // The draft's lock, as every edit and step takes it, so the reply and a resubmission take turns.
    const [draft] = await tx
      .select({ id: indicatorVersion.id, isLocked: indicatorVersion.isLocked })
      .from(indicatorVersion)
      .where(
        and(eq(indicatorVersion.indicatorId, indicatorId), isUnpublished(indicatorVersion.status)),
      )
      .for('no key update');

    if (draft === undefined) return { ok: false, reason: 'no_draft' };
    if (draft.isLocked) return { ok: false, reason: 'locked' };

    const [latest] = await tx
      .select({
        id: indicatorVersionSubmission.id,
        number: indicatorVersionSubmission.number,
        status: indicatorVersionSubmission.status,
        revisionResponse: indicatorVersionSubmission.revisionResponse,
      })
      .from(indicatorVersionSubmission)
      .where(eq(indicatorVersionSubmission.indicatorVersionId, draft.id))
      .orderBy(desc(indicatorVersionSubmission.number))
      .limit(1);

    if (latest?.status !== 'changes_requested') return { ok: false, reason: 'not_allowed' };

    const version = precondition.versionOf({
      submissionNumber: latest.number,
      revisionResponse: latest.revisionResponse,
    });
    if (version !== precondition.version) return { ok: false, reason: 'changed', version };

    await tx
      .update(indicatorVersionSubmission)
      .set({ revisionResponse: text })
      .where(eq(indicatorVersionSubmission.id, latest.id));
    await tx
      .update(indicatorVersion)
      .set({ updatedAt: sql`now()`, updatedBy: actor.userId })
      .where(eq(indicatorVersion.id, draft.id));

    const changes = changesBetween(
      { revisionResponse: latest.revisionResponse },
      { revisionResponse: text },
    );
    if (Object.keys(changes).length > 0) {
      await recordAudit(tx, actor, [
        { action: 'indicator.revision_response_updated', entityId: indicatorId, changes },
      ]);
    }

    return {
      ok: true,
      version: precondition.versionOf({ submissionNumber: latest.number, revisionResponse: text }),
    };
  });
}

/** The version of the reply a page shows, which its save sends back. */
export function revisionReplyVersion({
  submissionNumber,
  revisionResponse,
}: RevisionReply): string {
  return editVersion({ submissionNumber, revisionResponse });
}
