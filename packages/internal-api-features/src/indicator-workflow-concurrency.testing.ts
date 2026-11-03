import type { Database } from '@fphd/db';
import type { Actor } from '@fphd/db/audit-log';
import { sql } from 'drizzle-orm';
import { expect } from 'vitest';

import type { IndicatorStep } from './contract.ts';
import { AS_ACTOR, LOCK_WAIT, lockWaited, lockWaiters } from './indicator-repository.testing.ts';
import { type IndicatorStepWrite, takeIndicatorStep } from './indicator-workflow-repository.ts';

/**
 * Takes `step` as `actor`, with `stepWrite` for its own rows, while it holds the draft's lock
 * until `write` has started and is seen waiting on it, then answers what each returned.
 */
export async function writeWhileStepHolds<Result>(
  db: Database,
  indicatorId: string,
  step: IndicatorStep,
  write: () => Promise<Result>,
  { actor = AS_ACTOR, stepWrite }: { actor?: Actor; stepWrite?: IndicatorStepWrite } = {},
) {
  let held: () => void = () => {};
  let release: () => void = () => {};
  const holding = new Promise<void>((resolve) => {
    held = resolve;
  });
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const stepped = takeIndicatorStep(db, indicatorId, step, actor, {
    precondition: async () => {
      held();
      await released;
      return undefined;
    },
    ...(stepWrite === undefined ? {} : { write: stepWrite }),
  });
  await holding;
  const written = write();
  try {
    await lockWaited(db);
  } finally {
    release();
  }
  return { step: await stepped, write: await written };
}

/**
 * Runs `write` until it has written the draft's row and waits to record its audit entry, starts
 * `step` waiting behind it, then lets the write commit, and answers what each returned.
 */
export async function stepWhileWriteHolds<Written, Stepped>(
  db: Database,
  write: () => Promise<Written>,
  step: () => Promise<Stepped>,
) {
  const { written, stepped } = await db.transaction(async (tx) => {
    // The writes used here update the draft's row before recording their entry, so this holds
    // each with the row written and its transaction open. A timeout rolls this back, freeing it.
    await tx.execute(sql`LOCK TABLE audit_log IN EXCLUSIVE MODE`);
    const written = write();
    await expect.poll(() => lockWaiters(db), LOCK_WAIT).toBe(1);
    const stepped = step();
    await expect.poll(() => lockWaiters(db), LOCK_WAIT).toBe(2);
    return { written, stepped };
  });
  return { write: await written, step: await stepped };
}
