import type { Database } from '@fphd/db';

export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Whether `error`, or any error in its chain of causes, has `field` set to `value`. Drizzle wraps
 * the Postgres driver's error, so fields such as `code` are on a `cause` rather than on the error
 * that is thrown.
 */
function hasCause(error: unknown, field: 'code' | 'constraint_name', value: string): boolean {
  for (let current = error; current !== null && current !== undefined; ) {
    if (typeof current !== 'object') return false;
    if (field in current && (current as Record<string, unknown>)[field] === value) return true;
    current = (current as { cause?: unknown }).cause;
  }

  return false;
}

export function hasSqlState(error: unknown, sqlState: string): boolean {
  return hasCause(error, 'code', sqlState);
}

export function violatesConstraint(error: unknown, constraint: string): boolean {
  return hasCause(error, 'constraint_name', constraint);
}
