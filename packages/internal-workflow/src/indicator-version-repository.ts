import { schema } from '@fphd/db';
import { eq } from 'drizzle-orm';

import type { Transaction } from './database.ts';

const { currentPublishedVersion, indicatorVersion } = schema;

/** One `indicator_version` row with every column, as a step reads the draft version it locks. */
export type IndicatorDraftVersion = typeof indicatorVersion.$inferSelect;

export async function isPublished(tx: Transaction, indicatorId: string): Promise<boolean> {
  const [published] = await tx
    .select({ id: currentPublishedVersion.id })
    .from(currentPublishedVersion)
    .where(eq(currentPublishedVersion.indicatorId, indicatorId));

  return published !== undefined;
}
