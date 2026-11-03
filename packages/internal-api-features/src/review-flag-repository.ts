import { schema } from '@fphd/db';
import { and, eq, isNull } from 'drizzle-orm';

import type { Transaction } from './indicator-repository-sql.ts';

const { indicatorVersionSubmissionFlag, indicatorVersionSubmissionResponse } = schema;

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
