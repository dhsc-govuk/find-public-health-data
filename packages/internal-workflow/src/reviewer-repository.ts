import { schema } from '@fphd/db';
import { type AuditChanges, listChanges } from '@fphd/db/audit-log';

import type { Transaction } from './database.ts';

const { indicatorVersionSubmissionReviewer } = schema;

/** A reviewer of one submission to carry onto the next, with the user who first assigned them. */
export interface CarriedReviewer {
  reviewerId: string;
  assignedBy: string;
}

/**
 * Assigns the carried reviewers to the new submission, each keeping the user who first assigned
 * them, and returns the change for the audit entry. With no reviewers to carry, it writes nothing
 * and returns no change.
 */
export async function carryReviewers(
  tx: Transaction,
  submissionId: string,
  carried: readonly CarriedReviewer[],
): Promise<AuditChanges> {
  if (carried.length === 0) return {};
  await tx
    .insert(indicatorVersionSubmissionReviewer)
    .values(carried.map((reviewer) => ({ submissionId, ...reviewer })));
  return listChanges(
    { reviewerIds: [] },
    { reviewerIds: carried.map(({ reviewerId }) => reviewerId) },
    ['reviewerIds'],
  );
}
