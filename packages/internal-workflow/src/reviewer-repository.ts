import { schema } from '@fphd/db';
import { type AuditChanges, listChanges } from '@fphd/db/audit-log';

import type { Transaction } from './database.ts';

const { indicatorVersionSubmissionReviewer } = schema;

/** A reviewer of one submission to carry onto the next, with whoever first assigned them. */
export interface CarriedReviewer {
  reviewerId: string;
  assignedBy: string;
}

/**
 * Assigns the carried reviewers to the new submission, each keeping who assigned them, and
 * answers the change for the audit; nothing when there are none.
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
