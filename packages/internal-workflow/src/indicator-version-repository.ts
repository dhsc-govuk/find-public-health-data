import { schema } from '@fphd/db';
import { eq } from 'drizzle-orm';

import type { Transaction } from './database.ts';

const { currentPublishedVersion, indicatorVersion } = schema;

/** Every column of one version, as a section reads its answers from the draft. */
export type IndicatorDraftVersion = typeof indicatorVersion.$inferSelect;

export async function isPublished(tx: Transaction, indicatorId: string): Promise<boolean> {
  const [published] = await tx
    .select({ id: currentPublishedVersion.id })
    .from(currentPublishedVersion)
    .where(eq(currentPublishedVersion.indicatorId, indicatorId));

  return published !== undefined;
}
