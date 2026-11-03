import { schema } from '@fphd/db';
import type { Actor, AuditChanges } from '@fphd/db/audit-log';
import {
  FLAGGABLE_TASK_KEYS,
  type FlaggableTaskKey,
  type IndicatorTaskKey,
} from '@fphd/utils/indicator-task-key';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';

import type { Transaction } from './indicator-repository-sql.ts';

const {
  indicatorVersionSubmission,
  indicatorVersionSubmissionFlag,
  indicatorVersionSubmissionResponse,
} = schema;

/** Whether any response to the submission flags a task the publisher has not saved since. */
export async function hasUnclearedFlag(tx: Transaction, submissionId: string): Promise<boolean> {
  const [flag] = await tx
    .select({ taskKey: indicatorVersionSubmissionFlag.taskKey })
    .from(indicatorVersionSubmissionFlag)
    .innerJoin(
      indicatorVersionSubmissionResponse,
      eq(indicatorVersionSubmissionResponse.id, indicatorVersionSubmissionFlag.responseId),
    )
    .where(
      and(
        eq(indicatorVersionSubmissionResponse.submissionId, submissionId),
        isNull(indicatorVersionSubmissionFlag.clearedAt),
      ),
    )
    .limit(1);
  return flag !== undefined;
}

function isFlaggable(task: IndicatorTaskKey): task is FlaggableTaskKey {
  return (FLAGGABLE_TASK_KEYS as readonly IndicatorTaskKey[]).includes(task);
}

/**
 * Clears the flag on `task` that a response to the draft's latest submission left, while that
 * submission is sent back for changes: the publisher has saved the task, changed or not. Called
 * in the save's own transaction, which already holds the draft. Answers the audit change, empty
 * when there was no flag to clear.
 */
export async function clearFlag(
  tx: Transaction,
  draftId: string,
  task: IndicatorTaskKey,
  actor: Actor,
): Promise<AuditChanges> {
  // The notes for reviewers are never flagged, so their saves cost no statement.
  if (!isFlaggable(task)) return {};

  const latest = tx
    .select({ id: indicatorVersionSubmission.id })
    .from(indicatorVersionSubmission)
    .where(eq(indicatorVersionSubmission.indicatorVersionId, draftId))
    .orderBy(desc(indicatorVersionSubmission.number))
    .limit(1);
  const responses = tx
    .select({ id: indicatorVersionSubmissionResponse.id })
    .from(indicatorVersionSubmissionResponse)
    .innerJoin(
      indicatorVersionSubmission,
      eq(indicatorVersionSubmission.id, indicatorVersionSubmissionResponse.submissionId),
    )
    .where(
      and(
        eq(indicatorVersionSubmission.id, sql`(${latest})`),
        eq(indicatorVersionSubmission.status, 'changes_requested'),
      ),
    );
  const cleared = await tx
    .update(indicatorVersionSubmissionFlag)
    .set({ clearedBy: actor.userId, clearedAt: sql`clock_timestamp()` })
    .where(
      and(
        inArray(indicatorVersionSubmissionFlag.responseId, responses),
        eq(indicatorVersionSubmissionFlag.taskKey, task),
        isNull(indicatorVersionSubmissionFlag.clearedAt),
      ),
    )
    .returning({ taskKey: indicatorVersionSubmissionFlag.taskKey });

  return cleared.length === 0 ? {} : { flags: { before: [task], after: [] } };
}
