import { createHash } from 'node:crypto';

/**
 * The version of what one form edits: a hash of the stored values it shows. Each caller builds
 * the values in one fixed key order, so the same values always hash the same.
 */
export function editVersion(values: unknown): string {
  return createHash('sha256').update(JSON.stringify(values)).digest('hex');
}

/** The version a save was shown, and how to take the version from the row as it is now. */
export interface EditPrecondition<Row> {
  version: string;
  versionOf(row: Row): string;
}
