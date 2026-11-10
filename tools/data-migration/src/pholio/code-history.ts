import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { parse } from 'csv-parse/sync';

/** When an area's code came into use and ended, both inclusive. */
export interface CodeValidity {
  from: string;
  /** Null while the code is live. */
  to: string | null;
}

/** An ONS Code History Database date, `dd/mm/yyyy hh:mm`, as an ISO date. */
function isoDate(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(value.trim());
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

/**
 * Each GSS code's validity from the ONS Code History Database's `ChangeHistory.csv`. A code with
 * several rows runs from its earliest operative date, and ends at its latest termination date
 * unless one of its rows is still live.
 */
export function parseCodeHistory(text: string): Map<string, CodeValidity> {
  const rows: Record<string, string>[] = parse(text, { columns: true, bom: true });
  const validity = new Map<string, CodeValidity>();

  for (const row of rows) {
    const code = row.GEOGCD;
    const from = isoDate(row.OPER_DATE ?? '');
    if (!code || from === null) continue;
    const to = isoDate(row.TERM_DATE ?? '');
    const existing = validity.get(code);

    if (existing === undefined) {
      validity.set(code, { from, to });
      continue;
    }
    validity.set(code, {
      from: from < existing.from ? from : existing.from,
      to: existing.to === null || to === null ? null : to > existing.to ? to : existing.to,
    });
  }

  return validity;
}

/** The parsed file, and its digest for the export's manifest. */
export async function readCodeHistory(
  path: string,
): Promise<{ validity: Map<string, CodeValidity>; sha256: string }> {
  const bytes = await readFile(path);
  // Names hold Welsh characters in more than one encoding. Codes and dates are ASCII, so reading
  // the bytes as Latin-1 can't fail and leaves both intact.
  return {
    validity: parseCodeHistory(bytes.toString('latin1')),
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}
