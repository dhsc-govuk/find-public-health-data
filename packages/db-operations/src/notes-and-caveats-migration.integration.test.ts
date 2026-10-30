import { createTestDb, type TestDb } from '@fphd/db/testing';
import type postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { migrateBefore, migrateThrough } from './testing.ts';

const MIGRATION = '0022_other-notes-and-caveats';

interface Prose {
  disclosureControl?: string | null;
  caveats?: string | null;
  notes?: string | null;
}

// Prose as Fingertips left it, keyed by the short id of the version holding it.
const PROSE: Record<number, Prose> = {
  1: { disclosureControl: 'Not applied', caveats: 'None', notes: 'n/a' },
  2: { disclosureControl: '<p>None  applied.</p>', caveats: 'Survey data.', notes: ' None. ' },
  3: { disclosureControl: 'NO DISCLOSURE CONTROL APPLIED. Data source is in the public domain.' },
  4: { disclosureControl: 'Not applicable' },
  5: { disclosureControl: 'N/A.' },
  6: {
    disclosureControl:
      'Not required. Data is already in the public domain and counts based on small numbers have been suppressed at source.',
  },
  7: {
    disclosureControl:
      'Not applicable, however values for Isles of Scilly will be suppressed where counts are small.',
  },
  8: { disclosureControl: 'Not applied. Data are publicly available on the ONS website.' },
  9: { disclosureControl: 'None applied..' },
  10: { disclosureControl: ' \n', caveats: null, notes: '' },
};

let testDb: TestDb;
let sql: postgres.Sql;

beforeAll(async () => {
  testDb = await createTestDb({ template: 'unmigrated' });
  sql = testDb.sql;
  await migrateBefore(sql, MIGRATION);

  for (const [shortId, prose] of Object.entries(PROSE)) {
    await sql`
      WITH created AS (INSERT INTO indicator (short_id) VALUES (${Number(shortId)}) RETURNING id)
      INSERT INTO indicator_version
        (indicator_id, name, slug, disclosure_control, caveats, notes, created_by, updated_by)
      SELECT id, ${`Indicator ${shortId}`}, ${`indicator-${shortId}`},
             ${prose.disclosureControl ?? null}, ${prose.caveats ?? null}, ${prose.notes ?? null},
             'migration-test', 'migration-test'
      FROM created
    `;
  }

  await migrateThrough(sql, MIGRATION);
});

afterAll(async () => {
  await testDb?.drop();
});

async function answersOf(shortId: number) {
  const [row] = await sql`
    SELECT v.disclosure_control, v.disclosure_control_detail, v.caveats_needed, v.caveats_detail,
           v.other_notes_needed, v.other_notes_detail, v.rounding_applied, v.rounding_detail
    FROM indicator_version v JOIN indicator i ON i.id = v.indicator_id
    WHERE i.short_id = ${shortId}
  `;
  return row;
}

describe(`migration ${MIGRATION}`, () => {
  it('answers no to prose that says none was applied or needed, dropping it', async () => {
    expect(await answersOf(1)).toEqual({
      disclosure_control: 'no',
      disclosure_control_detail: null,
      caveats_needed: false,
      caveats_detail: null,
      other_notes_needed: false,
      other_notes_detail: null,
      rounding_applied: null,
      rounding_detail: null,
    });
  });

  it('matches prose once its markup, spacing, case and one full stop are set aside', async () => {
    expect(await answersOf(2)).toMatchObject({
      disclosure_control: 'no',
      disclosure_control_detail: null,
      caveats_needed: true,
      caveats_detail: 'Survey data.',
      other_notes_needed: false,
      other_notes_detail: null,
    });
    expect(await answersOf(3)).toMatchObject({
      disclosure_control: 'no',
      disclosure_control_detail: null,
    });
  });

  it.each([4, 5])('answers not applicable to prose that says so (%i)', async (shortId) => {
    expect(await answersOf(shortId)).toMatchObject({
      disclosure_control: 'not-applicable',
      disclosure_control_detail: null,
    });
  });

  it.each([6, 7, 8, 9])(
    'keeps any other prose as the detail of a yes, whatever it starts with (%i)',
    async (shortId) => {
      expect(await answersOf(shortId)).toMatchObject({
        disclosure_control: 'yes',
        disclosure_control_detail: PROSE[shortId]?.disclosureControl,
      });
    },
  );

  it('leaves blank prose unanswered', async () => {
    expect(await answersOf(10)).toMatchObject({
      disclosure_control: null,
      disclosure_control_detail: null,
      caveats_needed: null,
      caveats_detail: null,
      other_notes_needed: null,
      other_notes_detail: null,
    });
  });
});
