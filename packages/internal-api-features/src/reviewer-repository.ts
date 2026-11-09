import { fakeUsers } from '@fphd/auth';
import { canReviewIndicators } from '@fphd/auth/permissions';
import { type Database, schema } from '@fphd/db';
import type { CarriedReviewer } from '@fphd/internal-workflow';
import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';

import type { ReviewerOption } from './contract.ts';
import { indicatorCreatedBy, type Transaction } from './indicator-repository-sql.ts';

const {
  appUser,
  indicator,
  indicatorVersion,
  indicatorVersionSubmission,
  indicatorVersionSubmissionReviewer,
  isUnpublished,
} = schema;

type Reader = Database | Transaction;

/** Everyone holding the IMRG reviewer role: the fake users with it, until roles are stored. */
function reviewerRoleHolderIds(): string[] {
  return fakeUsers.filter(canReviewIndicators).map(({ id }) => id);
}

async function creatorOf(db: Reader, indicatorId: string): Promise<string | null | undefined> {
  const [row] = await db
    .select({ createdBy: indicatorCreatedBy })
    .from(indicator)
    .where(eq(indicator.id, indicatorId));
  return row?.createdBy;
}

async function latestDraftSubmitterOf(
  db: Reader,
  indicatorId: string,
): Promise<string | undefined> {
  const [latest] = await db
    .select({ submittedBy: indicatorVersionSubmission.submittedBy })
    .from(indicatorVersionSubmission)
    .innerJoin(
      indicatorVersion,
      and(
        eq(indicatorVersion.id, indicatorVersionSubmission.indicatorVersionId),
        isUnpublished(indicatorVersion.status),
      ),
    )
    .where(eq(indicatorVersionSubmission.indicatorId, indicatorId))
    .orderBy(desc(indicatorVersionSubmission.number))
    .limit(1);
  return latest?.submittedBy;
}

/**
 * The reviewers who may review the indicator: everyone with the role but its creator and
 * `submitterId`, who submitted its draft's latest submission.
 */
export async function findEligibleReviewerIds(
  db: Reader,
  indicatorId: string,
  submitterId: string | undefined,
): Promise<string[]> {
  const excluded = [await creatorOf(db, indicatorId), submitterId];
  return reviewerRoleHolderIds().filter((id) => !excluded.includes(id));
}

/** The reviewers assigned to the submission. */
export async function assignedReviewerIds(db: Reader, submissionId: string): Promise<string[]> {
  const rows = await db
    .select({ reviewerId: indicatorVersionSubmissionReviewer.reviewerId })
    .from(indicatorVersionSubmissionReviewer)
    .where(eq(indicatorVersionSubmissionReviewer.submissionId, submissionId));
  return rows.map(({ reviewerId }) => reviewerId);
}

/**
 * The reviewers of `submissionId` who may still review the indicator once `submitterId` submits
 * it again: those who still hold the role and are neither its creator nor the new submitter.
 */
export async function carriedReviewersOf(
  db: Reader,
  indicatorId: string,
  submissionId: string,
  submitterId: string,
): Promise<CarriedReviewer[]> {
  const [rows, eligible] = await Promise.all([
    db
      .select({
        reviewerId: indicatorVersionSubmissionReviewer.reviewerId,
        assignedBy: indicatorVersionSubmissionReviewer.assignedBy,
      })
      .from(indicatorVersionSubmissionReviewer)
      .where(eq(indicatorVersionSubmissionReviewer.submissionId, submissionId))
      .orderBy(asc(indicatorVersionSubmissionReviewer.reviewerId)),
    findEligibleReviewerIds(db, indicatorId, submitterId),
  ]);
  return rows.filter(({ reviewerId }) => eligible.includes(reviewerId));
}

/**
 * The reviewers who may review the indicator, by name, each with the number of submissions in
 * review they are assigned to: one per indicator, as only a draft's latest submission is open.
 */
export async function listReviewerOptions(
  db: Database,
  indicatorId: string,
): Promise<ReviewerOption[]> {
  const ids = await findEligibleReviewerIds(
    db,
    indicatorId,
    await latestDraftSubmitterOf(db, indicatorId),
  );
  if (ids.length === 0) return [];

  return db
    .select({
      id: appUser.id,
      name: appUser.displayName,
      assignedIndicatorCount: count(indicatorVersionSubmission.id),
    })
    .from(appUser)
    .leftJoin(
      indicatorVersionSubmissionReviewer,
      eq(indicatorVersionSubmissionReviewer.reviewerId, appUser.id),
    )
    .leftJoin(
      indicatorVersionSubmission,
      and(
        eq(indicatorVersionSubmission.id, indicatorVersionSubmissionReviewer.submissionId),
        eq(indicatorVersionSubmission.status, 'in_review'),
      ),
    )
    .where(inArray(appUser.id, ids))
    .groupBy(appUser.id)
    .orderBy(asc(appUser.displayName), asc(appUser.id));
}
