import { describe, expect, it } from 'vitest';

import {
  INDICATOR_ID,
  migrationFixture,
  SOURCE_ID,
  VERSION_COLUMNS,
  VERSION_ID,
  VERSION_ROW,
} from './data-migration.testing.ts';
import { applyDataMigration, type DataMigrationProgress } from './data-migration.ts';
import { dataMigrationTestDb, PUBLISHER, version } from './data-migration-db.testing.ts';

const db = dataMigrationTestDb();
const { apply, baseline, sourceCount, assertRolledBack } = db;

describe('applyDataMigration', () => {
  it('names unknown topic and classification IDs in relationship errors', async () => {
    await baseline();
    await expect(
      apply({ relationships: { indicatorTopics: [{ fingertipsId: 108, topicId: SOURCE_ID }] } }),
    ).rejects.toThrow(`unknown topics: ${SOURCE_ID}`);
    await expect(
      apply({
        relationships: {
          indicatorClassifications: [{ fingertipsId: 108, classificationId: SOURCE_ID }],
        },
      }),
    ).rejects.toThrow(`unknown classifications: ${SOURCE_ID}`);
    await assertRolledBack();
  });
  it.each([
    { indicators: [], error: 'published indicators absent from coverage: 108' },
    { indicators: [108, 109], error: 'declared indicators without a published version: 109' },
  ])(
    'names mismatched indicator coverage and rolls back: $error',
    async ({ indicators, error }) => {
      await baseline();
      await expect(apply({ relationships: { indicators, indicatorTopics: [] } })).rejects.toThrow(
        error,
      );
      await assertRolledBack();
    },
  );
  it('maps source CI method names to core UUIDs', async () => {
    await baseline();
    const row = [...VERSION_ROW];
    row[8] = SOURCE_ID;
    await apply({
      upserts: {
        indicator_version: { columns: VERSION_COLUMNS, rows: [row] },
        ci_method: {
          columns: ['id', 'name', 'description'],
          rows: [[SOURCE_ID, 'Normal approximation', null]],
        },
      },
    });
    const [loaded] = await db.sql<{ name: string }[]>`
      SELECT c.name FROM indicator_version v JOIN ci_method c ON c.id = v.ci_method_id WHERE v.id = ${VERSION_ID}
    `;
    expect(loaded?.name).toBe('Wald normal approximation');
  });
  it.each(['baseline', 'increment'] as const)(
    '%s imports reject unmapped sources before loading observations',
    async (kind) => {
      if (kind === 'increment') await baseline();
      const { manifest, sha256 } = await migrationFixture(db.sql, db.directory, db.topicId, {
        baseline: kind === 'baseline',
        upserts: {
          indicator_version: version([SOURCE_ID, null]),
          numerator_denominator_source: {
            columns: ['id', 'name', 'url'],
            rows: [[SOURCE_ID, 'Unknown source', null]],
          },
        },
      });
      const progress: DataMigrationProgress[] = [];
      await expect(
        db.sql.begin((tx) =>
          applyDataMigration(tx, db.directory, manifest, sha256, (event) => progress.push(event)),
        ),
      ).rejects.toThrow('No mapping for the sources Unknown source');
      expect(progress.some(({ table }) => table === 'observation')).toBe(false);
      const [counts] = await db.sql<{ versions: number; migrations: number }[]>`
        SELECT count(*)::int AS versions,
          (SELECT count(*)::int FROM data_migration) AS migrations
        FROM indicator_version
      `;
      const expected = kind === 'baseline' ? 0 : 1;
      expect(counts).toEqual({ versions: expected, migrations: expected });
    },
  );
  it('leaves sources of unchanged versions intact', async () => {
    await baseline({
      upserts: {
        indicator_version: version([SOURCE_ID, null]),
        numerator_denominator_source: {
          columns: ['id', 'name', 'url'],
          rows: [[SOURCE_ID, 'Care Quality Commission (CQC), Care directory', null]],
        },
      },
    });
    await apply();
    expect(await sourceCount()).toBe(1);
  });
  it.each([null, 'Not applicable (N/A)'])(
    'removes obsolete numerator and denominator sources for %s',
    async (name) => {
      await baseline({
        upserts: {
          indicator_version: version([SOURCE_ID, SOURCE_ID]),
          numerator_denominator_source: {
            columns: ['id', 'name', 'url'],
            rows: [[SOURCE_ID, 'Care Quality Commission (CQC), Care directory', null]],
          },
        },
      });
      expect(await sourceCount()).toBe(2);
      await apply({
        upserts: {
          indicator_version: version(name === null ? [null, null] : [SOURCE_ID, SOURCE_ID]),
          numerator_denominator_source: {
            columns: ['id', 'name', 'url'],
            rows: name === null ? [] : [[SOURCE_ID, name, null]],
          },
        },
      });
      expect(await sourceCount()).toBe(0);
    },
  );
  it('shrinks source mappings and reads a reordered legacy source header by name', async () => {
    await baseline({
      upserts: {
        indicator_version: version([SOURCE_ID, null]),
        numerator_denominator_source: {
          columns: ['name', 'url', 'id'],
          rows: [
            [
              'Ministry of Housing, Communities and Local Government (MHCLG), Homelessness statistics and Department for Energy Security and Net Zero (DESNZ), Fuel poverty statistics',
              null,
              SOURCE_ID,
            ],
          ],
        },
      },
    });
    expect(await sourceCount()).toBe(2);
    await apply({
      upserts: {
        indicator_version: version([SOURCE_ID, null]),
        numerator_denominator_source: {
          columns: ['name', 'id', 'url'],
          rows: [['Care Quality Commission (CQC), Care directory', SOURCE_ID, null]],
        },
      },
    });
    expect(await sourceCount()).toBe(1);
    const [provider] = await db.sql<{ name: string }[]>`
      SELECT p.name FROM indicator_version_source s JOIN data_provider p ON p.id = s.provider_id WHERE s.indicator_version_id = ${VERSION_ID}
    `;
    expect(provider?.name).toBe('Care Quality Commission (CQC)');
  });
  it('preserves historical topics, classifications and answers', async () => {
    await baseline();
    const preserved = await db.sql<{ id: string }[]>`
      INSERT INTO indicator_version (indicator_id, status, published_at, name, slug, created_by, updated_by, has_framework)
      VALUES (${INDICATOR_ID}, 'published', '2025-01-01', 'History', 'test-indicator', ${PUBLISHER}, ${PUBLISHER}, true)
      RETURNING id
    `;
    for (const { id } of preserved) {
      await db.sql`INSERT INTO indicator_version_topic (indicator_version_id, topic_id) VALUES (${id}, ${db.topicId})`;
      await db.sql`INSERT INTO indicator_version_classification (indicator_version_id, classification_id) VALUES (${id}, ${db.frameworkId})`;
    }
    await apply({ upserts: { indicator_version: version() } });
    const rows = await db.sql<
      { status: string; topics: number; classifications: number; hasFramework: boolean }[]
    >`
      SELECT v.status, v.has_framework AS "hasFramework",
        (SELECT count(*)::int FROM indicator_version_topic t WHERE t.indicator_version_id = v.id) AS topics,
        (SELECT count(*)::int FROM indicator_version_classification c WHERE c.indicator_version_id = v.id) AS classifications
      FROM indicator_version v WHERE v.id IN ${db.sql(preserved.map(({ id }) => id))} ORDER BY status
    `;
    expect(rows).toEqual([
      { status: 'published', hasFramework: true, topics: 1, classifications: 1 },
    ]);
  });
  it('refuses source indicators with no published version or reviewed topic coverage', async () => {
    await baseline();
    await expect(
      apply({ upserts: { indicator: { columns: ['id', 'short_id'], rows: [[SOURCE_ID, 109]] } } }),
    ).rejects.toThrow('source indicators are missing from reviewed relationship coverage: 109');
    await assertRolledBack();
  });
  it('clears removed classification answers and retains answers backed by assignments', async () => {
    await baseline({
      relationships: {
        indicatorClassifications: [
          { fingertipsId: 108, classificationId: db.frameworkId },
          { fingertipsId: 108, classificationId: db.lifeStageId },
        ],
      },
    });
    await apply({
      relationships: {
        indicatorClassifications: [{ fingertipsId: 108, classificationId: db.lifeStageId }],
      },
    });
    const [row] = await db.sql<{ framework: boolean | null; lifeStage: boolean | null }[]>`
      SELECT has_framework AS framework, has_life_stage AS "lifeStage" FROM indicator_version WHERE id = ${VERSION_ID}
    `;
    expect(row).toEqual({ framework: false, lifeStage: true });
    await apply({
      predecessor: 'increment-2',
      migrationId: 'increment-3',
      cutoffAt: '2026-09-23T10:00:00Z',
    });
    const [removed] = await db.sql<
      { lifeStage: boolean | null }[]
    >`SELECT has_life_stage AS "lifeStage" FROM indicator_version WHERE id = ${VERSION_ID}`;
    expect(removed?.lifeStage).toBe(false);
  });
  it('retains explicit negative classification answers', async () => {
    await baseline();
    await db.sql`UPDATE indicator_version SET has_framework = false, has_life_stage = false WHERE id = ${VERSION_ID}`;
    await apply();
    const [row] = await db.sql<{ framework: boolean; lifeStage: boolean }[]>`
      SELECT has_framework AS framework, has_life_stage AS "lifeStage" FROM indicator_version WHERE id = ${VERSION_ID}
    `;
    expect(row).toEqual({ framework: false, lifeStage: false });
  });
  it('refuses missing topics and rolls back source edits, relationships and the ledger', async () => {
    await baseline();
    const [history] = await db.sql<{ id: string }[]>`
      INSERT INTO indicator_version (indicator_id, status, published_at, name, slug, created_by, updated_by)
      VALUES (${INDICATOR_ID}, 'published', '2025-01-01', 'History', 'test-indicator', ${PUBLISHER}, ${PUBLISHER}) RETURNING id
    `;
    if (!history) throw new Error('Missing published history version');
    await db.sql`INSERT INTO indicator_version_topic (indicator_version_id, topic_id) VALUES (${history.id}, ${db.topicId})`;
    const row = [...VERSION_ROW];
    row[4] = 'Changed name';
    await expect(
      apply({
        migrationId: 'refused-increment',
        relationships: { indicatorTopics: [] },
        upserts: { indicator_version: { columns: VERSION_COLUMNS, rows: [row] } },
      }),
    ).rejects.toThrow('Migrated indicators have no topic: 108 (Changed name)');
    await assertRolledBack();
  });
});
