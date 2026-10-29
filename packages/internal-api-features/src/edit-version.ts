import { createHash } from 'node:crypto';

/**
 * The version of what one form edits: a SHA-256 hash of the stored values it shows. Callers
 * must build the values with their keys in the same order every time, or equal values will
 * hash differently.
 */
export function editVersion(values: unknown): string {
  return createHash('sha256').update(JSON.stringify(values)).digest('hex');
}

/** The version the form was shown, and how to compute the version of the row as it is now. */
export interface EditPrecondition<Row> {
  version: string;
  versionOf(row: Row): string;
}
