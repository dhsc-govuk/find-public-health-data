import { sql } from 'drizzle-orm';

import type { Transaction } from './database.ts';

// Scopes the slug locks within the two-key advisory lock space; no other lock uses this first key.
export const SLUG_LOCK_NAMESPACE = 0x736c7567; // 'slug'

/**
 * Holds slugs until the transaction ends. Two writers of one slug otherwise each wait on the
 * other's exclusion check and deadlock; serialised, the later one fails the constraint instead.
 * Taken in one order, so two writers wanting the same pair cannot deadlock on the locks.
 */
export async function lockSlugs(
  tx: Transaction,
  slugs: readonly (string | undefined)[],
): Promise<void> {
  const held = [...new Set(slugs)].filter((slug) => slug !== undefined).sort();

  for (const slug of held) {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${SLUG_LOCK_NAMESPACE}, hashtext(${slug}))`);
  }
}
