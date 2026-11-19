import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Migration 0022 and the Python export each hold the prose that is an answer in itself, one
 * list per language; reading both here is what stops them drifting apart.
 */
const ENTRY = /\(\s*["'](\w+)["'],\s*["']([^"']+)["'],\s*["']([\w-]+)["'],?\s*\)/g;

function entriesIn(path: string, start: string, end: string): string[][] {
  const text = readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
  const from = text.indexOf(start);
  const section = text.slice(from, text.indexOf(end, from));
  return [...section.matchAll(ENTRY)].map(([, question, prose, answer]) => [
    question ?? '',
    prose ?? '',
    answer ?? '',
  ]);
}

describe('the notes and caveats vocabulary', () => {
  it('is the same in migration 0022 and in the export', () => {
    const migration = entriesIn(
      '../drizzle/0022_other-notes-and-caveats.sql',
      'WITH vocabulary',
      'answers AS',
    );
    const exported = entriesIn('../data/seed/export/notes_and_caveats.py', 'VOCABULARY = [', '\n]');

    expect(migration).toHaveLength(16);
    expect(exported).toEqual(migration);
  });
});
