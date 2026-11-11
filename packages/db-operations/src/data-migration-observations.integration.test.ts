import { schema } from '@fphd/db';
import { describe, expect, it } from 'vitest';

import { INDICATOR_ID, VERSION_ID } from './data-migration.testing.ts';
import {
  batch,
  dataMigrationTestDb,
  MIGRATED,
  PUBLISHER,
  version,
  versionWithBatch,
} from './data-migration-db.testing.ts';

const { IMPORTED_INDICATOR_TEAM_ID } = schema;

const { sql, apply, baseline, assertRolledBack } = await dataMigrationTestDb();

describe('applyDataMigration', () => {
  it('connects mutually referencing versions and batches and switches published observations', async () => {
    const firstBatch = '22222222-2222-7222-8222-222222222222';
    const secondBatch = '33333333-3333-7333-8333-333333333333';
    const areaId = '44444444-4444-7444-8444-444444444444';
    const observationId = '55555555-5555-7555-8555-555555555555';
    const confirmedAt = '2026-01-01T00:00:00Z';
    const observation = (batchId: string, value: number) => ({
      columns: [
        'id',
        'indicator_id',
        'area_id',
        'upload_batch_id',
        'from_date',
        'to_date',
        'value',
        'dimension_key',
        'created_by',
      ],
      rows: [
        [
          observationId,
          INDICATOR_ID,
          areaId,
          batchId,
          '2025-01-01',
          '2025-12-31',
          value,
          '',
          'pholio-migration',
        ],
      ],
    });
    await baseline({
      upserts: {
        indicator_version: versionWithBatch(firstBatch, confirmedAt),
        upload_batch: batch(firstBatch),
        area_type: {
          columns: ['id', 'name', 'hierarchy_type'],
          rows: [[areaId, 'England', 'Administrative']],
        },
        area: {
          columns: ['id', 'area_type_id', 'code', 'name', 'valid_from', 'is_current'],
          rows: [[areaId, areaId, 'E92000001', 'England', '2010-01-01', 't']],
        },
        observation: observation(firstBatch, 10),
      },
    });
    expect(await sql`SELECT value FROM published.observation`).toEqual([{ value: 10 }]);
    expect(
      await sql`SELECT v.upload_batch_id, b.indicator_version_id,
      v.data_table_confirmed_at IS NOT NULL AS confirmed
      FROM indicator_version v JOIN upload_batch b ON b.id = v.upload_batch_id`,
    ).toEqual([{ upload_batch_id: firstBatch, indicator_version_id: VERSION_ID, confirmed: true }]);
    await apply({
      upserts: {
        indicator_version: versionWithBatch(secondBatch, confirmedAt),
        upload_batch: batch(secondBatch),
        observation: observation(secondBatch, 20),
      },
      deletes: { upload_batch: [firstBatch] },
    });
    expect(await sql`SELECT value FROM published.observation`).toEqual([{ value: 20 }]);
    expect(await sql`SELECT upload_batch_id FROM indicator_version`).toEqual([
      { upload_batch_id: secondBatch },
    ]);
    expect(await sql`SELECT id FROM upload_batch`).toEqual([{ id: secondBatch }]);
    await apply({
      migrationId: 'increment-3',
      predecessor: 'increment-2',
      cutoffAt: '2026-09-23T10:00:00Z',
      upserts: { indicator_version: version() },
    });
    expect(
      await sql`SELECT upload_batch_id, data_table_confirmed_at IS NOT NULL AS confirmed FROM indicator_version`,
    ).toEqual([{ upload_batch_id: secondBatch, confirmed: true }]);
    await apply({
      migrationId: 'increment-4',
      predecessor: 'increment-3',
      cutoffAt: '2026-09-24T10:00:00Z',
      upserts: { indicator_version: versionWithBatch(null, null) },
      deletes: { upload_batch: [secondBatch], observation: [observationId] },
    });
    expect(
      await sql`SELECT upload_batch_id, data_table_confirmed_at FROM indicator_version`,
    ).toEqual([{ upload_batch_id: null, data_table_confirmed_at: null }]);
    expect(await sql`SELECT id FROM published.observation`).toEqual([]);
  });
  it('upserts and deletes bridge rows by their observation and core dimension or note type', async () => {
    const batchId = '22222222-2222-7222-8222-222222222222';
    const observationId = '55555555-5555-7555-8555-555555555555';
    // Package ids that differ from the core rows of the same name, so every bridge key is mapped.
    const sexId = '66666666-6666-7666-8666-666666666666';
    const maleId = '77777777-7777-7777-8777-777777777777';
    const femaleId = '88888888-8888-7888-8888-888888888888';
    const noteId = '99999999-9999-7999-8999-999999999999';
    const references = {
      dimension_type: {
        columns: ['id', 'name', 'dimension_class'],
        rows: [[sexId, 'Sex', 'core']],
      },
      dimension_value: {
        columns: ['id', 'dimension_type_id', 'name'],
        rows: [
          [maleId, sexId, 'Male'],
          [femaleId, sexId, 'Female'],
        ],
      },
      note_type: {
        columns: ['id', 'text', 'category'],
        rows: [[noteId, 'Disclosure control applied', 'disclosure']],
      },
    };
    const observation = (valueId: string) => ({
      columns: [
        'id',
        'indicator_id',
        'area_id',
        'upload_batch_id',
        'from_date',
        'to_date',
        'value',
        'dimension_key',
        'created_by',
      ],
      rows: [
        [
          observationId,
          INDICATOR_ID,
          '44444444-4444-7444-8444-444444444444',
          batchId,
          '2025-01-01',
          '2025-12-31',
          10,
          valueId,
          'pholio-migration',
        ],
      ],
    });
    const dimension = (valueId: string) => ({
      columns: ['observation_id', 'dimension_value_id', 'dimension_type_id'],
      rows: [[observationId, valueId, sexId]],
    });
    await baseline({
      upserts: {
        ...references,
        indicator_version: versionWithBatch(batchId, '2026-01-01T00:00:00Z'),
        upload_batch: batch(batchId),
        observation: observation(maleId),
        observation_dimension: dimension(maleId),
        observation_note: {
          columns: ['observation_id', 'note_type_id'],
          rows: [[observationId, noteId]],
        },
      },
    });
    const bridges = () => sql`
      SELECT t.name AS type, v.name AS value, (
        SELECT count(*)::int FROM observation_note n WHERE n.observation_id = od.observation_id
      ) AS notes
      FROM observation_dimension od
      JOIN dimension_type t ON t.id = od.dimension_type_id
      JOIN dimension_value v ON v.id = od.dimension_value_id
    `;
    expect(await bridges()).toEqual([{ type: 'Sex', value: 'Male', notes: 1 }]);

    await apply({
      upserts: {
        ...references,
        observation: observation(femaleId),
        observation_dimension: dimension(femaleId),
      },
      deletes: { observation_note: [`${observationId},${noteId}`] },
    });

    expect(await bridges()).toEqual([{ type: 'Sex', value: 'Female', notes: 0 }]);
  });
  /**
   * Loads a baseline observation with one note, whose package note type is the core row for
   * disclosure control, and returns the core id. The package names the type by its core id unless
   * given another id, which the receiver matches to the core row by its text.
   */
  async function baselineWithDisclosureNote(
    observationId: string,
    packageNoteTypeId?: string,
  ): Promise<string> {
    const batchId = '22222222-2222-7222-8222-222222222222';
    const [disclosure] = await sql<{ id: string }[]>`
      SELECT id FROM note_type WHERE text = 'Disclosure control applied'
    `;
    if (!disclosure) throw new Error('Missing core note type');
    const noteTypeId = packageNoteTypeId ?? disclosure.id;
    await baseline({
      upserts: {
        indicator_version: versionWithBatch(batchId, '2026-01-01T00:00:00Z'),
        upload_batch: batch(batchId),
        note_type: {
          columns: ['id', 'text', 'category'],
          rows: [[noteTypeId, 'Disclosure control applied', 'disclosure']],
        },
        observation: {
          columns: [
            'id',
            'indicator_id',
            'area_id',
            'upload_batch_id',
            'from_date',
            'to_date',
            'value',
            'dimension_key',
            'created_by',
          ],
          rows: [
            [
              observationId,
              INDICATOR_ID,
              '44444444-4444-7444-8444-444444444444',
              batchId,
              '2025-01-01',
              '2025-12-31',
              10,
              '',
              'pholio-migration',
            ],
          ],
        },
        observation_note: {
          columns: ['observation_id', 'note_type_id'],
          rows: [[observationId, noteTypeId]],
        },
      },
    });
    return disclosure.id;
  }
  it('keeps a bridge row an increment deletes under one type id and upserts under another', async () => {
    const observationId = '55555555-5555-7555-8555-555555555555';
    const disclosureId = await baselineWithDisclosureNote(observationId);
    // The source dropped the note type the baseline named and lists another of the same text,
    // which maps to the same core row.
    const replacementId = '99999999-9999-7999-8999-999999999999';

    await apply({
      upserts: {
        note_type: {
          columns: ['id', 'text', 'category'],
          rows: [[replacementId, 'Disclosure control applied', 'disclosure']],
        },
        observation_note: {
          columns: ['observation_id', 'note_type_id'],
          rows: [[observationId, replacementId]],
        },
      },
      deletes: { observation_note: [`${observationId},${disclosureId}`] },
    });

    expect(await sql`SELECT observation_id, note_type_id FROM observation_note`).toEqual([
      { observation_id: observationId, note_type_id: disclosureId },
    ]);
  });
  it('deletes a bridge row whose type the package no longer lists by its core id', async () => {
    const observationId = '55555555-5555-7555-8555-555555555555';
    const disclosureId = await baselineWithDisclosureNote(observationId);

    await apply({ deletes: { observation_note: [`${observationId},${disclosureId}`] } });

    expect(await sql`SELECT observation_id FROM observation_note`).toEqual([]);
  });
  it('refuses a bridge delete whose type left the package after matching a core row by text', async () => {
    const observationId = '55555555-5555-7555-8555-555555555555';
    const packageId = '99999999-9999-7999-8999-999999999999';
    const disclosureId = await baselineWithDisclosureNote(observationId, packageId);

    await expect(
      apply({ deletes: { observation_note: [`${observationId},${packageId}`] } }),
    ).rejects.toThrow(
      `observation_note deletes name note_type ids that neither the package nor core data holds: ${packageId}`,
    );
    expect(await sql`SELECT note_type_id FROM observation_note`).toEqual([
      { note_type_id: disclosureId },
    ]);
  });
  it('requires the key columns of a bridge upsert', async () => {
    await baseline();
    await expect(
      apply({ upserts: { observation_note: { columns: ['observation_id'] } } }),
    ).rejects.toThrow('observation_note CSV is missing required columns: note_type_id');
    await assertRolledBack();
  });
  it('withdraws an indicator, its version, batch and observations in one increment', async () => {
    const batchId = '22222222-2222-7222-8222-222222222222';
    const areaId = '44444444-4444-7444-8444-444444444444';
    const observationId = '55555555-5555-7555-8555-555555555555';
    await baseline({
      upserts: {
        indicator_version: versionWithBatch(batchId, '2026-01-01T00:00:00Z'),
        upload_batch: batch(batchId),
        area_type: {
          columns: ['id', 'name', 'hierarchy_type'],
          rows: [[areaId, 'England', 'Administrative']],
        },
        area: {
          columns: ['id', 'area_type_id', 'code', 'name', 'valid_from', 'is_current'],
          rows: [[areaId, areaId, 'E92000001', 'England', '2010-01-01', 't']],
        },
        observation: {
          columns: [
            'id',
            'indicator_id',
            'area_id',
            'upload_batch_id',
            'from_date',
            'to_date',
            'value',
            'dimension_key',
            'created_by',
          ],
          rows: [
            [
              observationId,
              INDICATOR_ID,
              areaId,
              batchId,
              '2025-01-01',
              '2025-12-31',
              10,
              '',
              'pholio-migration',
            ],
          ],
        },
      },
    });
    const result = await apply({
      deletes: {
        indicator: [INDICATOR_ID],
        indicator_version: [VERSION_ID],
        upload_batch: [batchId],
        observation: [observationId],
      },
      relationships: { indicators: [], indicatorTopics: [] },
    });
    expect(result.changes.indicator_version).toEqual({ upserts: 0, deletes: 1 });
    expect(result.changes.upload_batch).toEqual({ upserts: 0, deletes: 1 });
    expect(await sql`SELECT id FROM published.indicator`).toEqual([]);
    expect(await sql`SELECT id FROM published.observation`).toEqual([]);
    for (const table of [
      'indicator',
      'indicator_version',
      'upload_batch',
      'observation',
      'indicator_version_topic',
    ]) {
      expect(await sql.unsafe(`SELECT count(*)::int AS count FROM ${table}`)).toEqual([
        { count: 0 },
      ]);
    }
    expect(await sql`SELECT count(*)::int AS count FROM data_migration`).toEqual([{ count: 2 }]);
  });
  it('rolls back cleared batch pointers when a later delete is blocked', async () => {
    const batchId = '22222222-2222-7222-8222-222222222222';
    await baseline({
      upserts: {
        indicator_version: versionWithBatch(batchId, '2026-01-01T00:00:00Z'),
        upload_batch: batch(batchId),
      },
    });
    await sql`INSERT INTO upload_batch (indicator_id, indicator_version_id, original_filename, uploaded_by)
      VALUES (${INDICATOR_ID}, ${VERSION_ID}, 'publisher.csv', ${PUBLISHER})`;
    await expect(
      apply({
        deletes: {
          indicator: [INDICATOR_ID],
          indicator_version: [VERSION_ID],
          upload_batch: [batchId],
        },
        relationships: { indicators: [], indicatorTopics: [] },
      }),
    ).rejects.toThrow('indicator_version deletion is blocked by retained references');
    expect(
      await sql`SELECT upload_batch_id, data_table_confirmed_at IS NOT NULL AS confirmed FROM indicator_version`,
    ).toEqual([{ upload_batch_id: batchId, confirmed: true }]);
    await assertRolledBack();
  });
  it('names identities whose deletion is blocked by publisher uploads', async () => {
    await baseline();
    await sql`INSERT INTO upload_batch (indicator_id, indicator_version_id, original_filename, uploaded_by) VALUES (${INDICATOR_ID}, ${VERSION_ID}, 'publisher.csv', ${PUBLISHER})`;
    await expect(
      apply({
        deletes: { indicator: [INDICATOR_ID], indicator_version: [VERSION_ID] },
        relationships: { indicators: [], indicatorTopics: [] },
      }),
    ).rejects.toThrow(
      `indicator_version deletion is blocked by retained references (ids: ${VERSION_ID})`,
    );
    await assertRolledBack();
  });
  it.each([0, 2])(
    'rejects a declared delete count of %s before deleting its staged row',
    async (rows) => {
      await baseline();
      await sql`INSERT INTO upload_batch (indicator_id, indicator_version_id, original_filename, uploaded_by) VALUES (${INDICATOR_ID}, ${VERSION_ID}, 'publisher.csv', ${PUBLISHER})`;
      await expect(
        apply({
          deletes: { indicator: [INDICATOR_ID], indicator_version: [VERSION_ID] },
          deleteRows: { indicator_version: rows },
          relationships: { indicators: [], indicatorTopics: [] },
        }),
      ).rejects.toThrow(`indicator_version staged 1 deletes; package declares ${rows}`);
      await assertRolledBack();
    },
  );
  it.each([
    ['indicator', 'upsert'],
    ['upload_batch', 'upsert'],
    ['upload_batch', 'delete'],
    ['observation', 'upsert'],
    ['observation', 'delete'],
    ['observation', 'reassign'],
    ['observation', 'historical upsert'],
    ['observation_dimension', 'upsert'],
    ['observation_dimension', 'delete'],
    ['observation_note', 'upsert'],
    ['observation_note', 'delete'],
  ] as const)('protects publisher-owned %s rows from migration %s', async (table, action) => {
    await baseline();
    const [identity] = await sql<
      { id: string }[]
    >`INSERT INTO indicator (short_id, team_id) VALUES (109, ${IMPORTED_INDICATOR_TEAM_ID}) RETURNING id`;
    if (!identity) throw new Error('Missing publisher indicator');
    const publisherIndicatorId = action === 'historical upsert' ? INDICATOR_ID : identity.id;
    const [publication] = await sql<{ id: string }[]>`
      INSERT INTO indicator_version (indicator_id, status, published_at, name, slug, created_by, updated_by)
      VALUES (${publisherIndicatorId}, 'published', '2025-01-01', 'FPHD only',
        ${action === 'historical upsert' ? 'test-indicator' : 'fphd-only'}, ${PUBLISHER}, ${PUBLISHER}) RETURNING id
    `;
    if (!publication) throw new Error('Missing publisher publication');
    const [upload] = await sql<{ id: string }[]>`
      INSERT INTO upload_batch (indicator_id, indicator_version_id, original_filename, uploaded_by, status)
      VALUES (${publisherIndicatorId}, ${publication.id}, 'publisher.csv', ${PUBLISHER}, 'processed') RETURNING id
    `;
    if (!upload) throw new Error('Missing publisher upload');
    await sql`UPDATE indicator_version SET upload_batch_id = ${upload.id}, data_table_confirmed_at = '2026-01-01' WHERE id = ${publication.id}`;
    const [areaType] = await sql<{ id: string }[]>`SELECT id FROM area_type WHERE name = 'England'`;
    if (!areaType) throw new Error('Missing area type');
    const [area] = await sql<
      { id: string }[]
    >`INSERT INTO area (area_type_id, code, name, valid_from) VALUES (${areaType.id}, ${`publisher-${table}-${action}`}, 'Publisher area', '2010-01-01') RETURNING id`;
    if (!area) throw new Error('Missing area');
    const [observed] = await sql<{ id: string }[]>`
      INSERT INTO observation (indicator_id, area_id, upload_batch_id, from_date, to_date, value, dimension_key)
      VALUES (${publisherIndicatorId}, ${area.id}, ${upload.id}, '2025-01-01', '2025-12-31', 10, '') RETURNING id
    `;
    if (!observed) throw new Error('Missing observation');
    const [dimensionType] = await sql<
      { id: string }[]
    >`SELECT id FROM dimension_type WHERE name = 'Sex'`;
    if (!dimensionType) throw new Error('Missing dimension type');
    const [dimensionValue] = await sql<
      { id: string }[]
    >`SELECT id FROM dimension_value WHERE dimension_type_id = ${dimensionType.id} AND name = 'Female'`;
    if (!dimensionValue) throw new Error('Missing dimension value');
    await sql`INSERT INTO observation_dimension (observation_id, dimension_value_id, dimension_type_id) VALUES (${observed.id}, ${dimensionValue.id}, ${dimensionType.id})`;
    const [noteType] = await sql<
      { id: string }[]
    >`INSERT INTO note_type (text, category) VALUES ('Publisher note', 'quality') ON CONFLICT (text) DO UPDATE SET category = excluded.category RETURNING id`;
    if (!noteType) throw new Error('Missing note type');
    await sql`INSERT INTO observation_note (observation_id, note_type_id) VALUES (${observed.id}, ${noteType.id})`;
    const fixtures = {
      indicator: {
        columns: ['id', 'short_id', 'data_updated_at'],
        rows: [[identity.id, 109, '2026-02-01']],
      },
      upload_batch: {
        columns: [
          'id',
          'indicator_id',
          'indicator_version_id',
          'original_filename',
          'uploaded_by',
          'status',
        ],
        rows: [
          [
            upload.id,
            publisherIndicatorId,
            publication.id,
            'replacement.csv',
            'pholio-migration',
            'processed',
          ],
        ],
      },
      observation: {
        columns: [
          'id',
          'indicator_id',
          'area_id',
          'upload_batch_id',
          'from_date',
          'to_date',
          'value',
          'dimension_key',
          'created_by',
        ],
        rows: [
          [
            observed.id,
            publisherIndicatorId,
            area.id,
            upload.id,
            '2025-01-01',
            '2025-12-31',
            999,
            '',
            'pholio-migration',
          ],
        ],
      },
      observation_dimension: {
        columns: ['observation_id', 'dimension_value_id', 'dimension_type_id'],
        rows: [[observed.id, dimensionValue.id, dimensionType.id]],
      },
      observation_note: {
        columns: ['observation_id', 'note_type_id'],
        rows: [[observed.id, noteType.id]],
      },
    };
    // The bridge tables are keyed by their observation and dimension type or note type.
    const keys = {
      indicator: [identity.id],
      upload_batch: [upload.id],
      observation: [observed.id],
      observation_dimension: [`${observed.id},${dimensionType.id}`],
      observation_note: [`${observed.id},${noteType.id}`],
    };
    if (action === 'reassign') {
      const [sourceBatch] = await sql<{ id: string }[]>`
        INSERT INTO upload_batch (indicator_id, indicator_version_id, original_filename, uploaded_by, status)
        VALUES (${INDICATOR_ID}, ${VERSION_ID}, 'source.csv', ${MIGRATED}, 'processed') RETURNING id
      `;
      if (!sourceBatch) throw new Error('Missing source batch');
      fixtures.observation.rows[0] = [
        observed.id,
        INDICATOR_ID,
        area.id,
        sourceBatch.id,
        '2025-01-01',
        '2025-12-31',
        999,
        '',
        'pholio-migration',
      ];
    }
    await expect(
      apply(
        action !== 'delete'
          ? { upserts: { [table]: fixtures[table] } }
          : { deletes: { [table]: keys[table] } },
      ),
    ).rejects.toThrow(
      `conflicts with FPHD publisher work on indicators: ${action === 'historical upsert' ? 108 : 109}`,
    );
    expect(await sql`SELECT value FROM observation WHERE id = ${observed.id}`).toEqual([
      { value: 10 },
    ]);
    expect(await sql`SELECT original_filename FROM upload_batch WHERE id = ${upload.id}`).toEqual([
      { original_filename: 'publisher.csv' },
    ]);
    expect(
      await sql`SELECT dimension_value_id FROM observation_dimension WHERE observation_id = ${observed.id}`,
    ).toEqual([{ dimension_value_id: dimensionValue.id }]);
    expect(
      await sql`SELECT note_type_id FROM observation_note WHERE observation_id = ${observed.id}`,
    ).toEqual([{ note_type_id: noteType.id }]);
    expect(await sql`SELECT data_updated_at FROM indicator WHERE id = ${identity.id}`).toEqual([
      { data_updated_at: null },
    ]);
    await assertRolledBack();
  });
  it.each(['link', 'age range'])(
    'protects publisher %s rows when source versions are deleted',
    async (child) => {
      await baseline();
      if (child === 'link') {
        await sql`INSERT INTO indicator_version_link (indicator_version_id, position, url, text) VALUES (${VERSION_ID}, 0, 'https://example.test', 'Publisher link')`;
      } else {
        await sql`INSERT INTO indicator_version_age_range (indicator_version_id, position, lower_limit, lower_limit_unit) VALUES (${VERSION_ID}, 0, 18, 'years')`;
      }
      const options = {
        deletes: { indicator: [INDICATOR_ID], indicator_version: [VERSION_ID] },
        relationships: { indicators: [], indicatorTopics: [] },
      };
      await expect(apply(options)).rejects.toThrow('publisher links or age ranges');
      await assertRolledBack();
      await sql`DELETE FROM indicator_version_link WHERE indicator_version_id = ${VERSION_ID}`;
      await sql`DELETE FROM indicator_version_age_range WHERE indicator_version_id = ${VERSION_ID}`;
      await apply(options);
      const [row] = await sql<{ indicators: number; topics: number }[]>`
      SELECT (SELECT count(*)::int FROM indicator) AS indicators,
        (SELECT count(*)::int FROM indicator_version_topic) AS topics
    `;
      expect(row).toEqual({ indicators: 0, topics: 0 });
    },
  );
});
