import { schema } from '@fphd/db';
import { apiLogin, createTestDb, type TestDb } from '@fphd/db/testing';
import type postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { asOwnerGroup, withPreviewViewsRecreated } from './migrations.ts';
import { createPreviewViews } from './preview-views.ts';

const ACTOR = schema.SYSTEM_USER_IDS.pholioMigration;

/** The names of the views in a schema. */
async function viewsIn(sql: postgres.Sql, schemaName: string): Promise<string[]> {
  const rows = await sql<{ name: string }[]>`
    SELECT viewname AS name FROM pg_views WHERE schemaname = ${schemaName} ORDER BY viewname
  `;
  return rows.map(({ name }) => name);
}

describe('the preview views on the seeded database', () => {
  let testDb: TestDb;
  let sql: postgres.Sql;
  /** A draft update of a published indicator that keeps the published batch. */
  let keepsBatch: { id: string; indicatorId: string };
  /** A draft update of another published indicator, with a batch of its own. */
  let newBatch: { id: string; indicatorId: string };
  /** The only version of an indicator never published. */
  let newIndicator: { id: string; indicatorId: string };
  /** A published update, with a summary for History, of an indicator whose first version it supersedes. */
  let publishedUpdate: { id: string; indicatorId: string };

  /** Copies an indicator's current published version as a draft, with the changes given. */
  async function draftOf(indicatorId: string, changes: Record<string, unknown>) {
    const [draft] = await sql<{ id: string; indicatorId: string }[]>`
      INSERT INTO indicator_version
      SELECT (jsonb_populate_record(NULL::indicator_version, to_jsonb(v) || ${sql.json({
        status: 'draft',
        published_at: null,
        ...changes,
      })}::jsonb || jsonb_build_object('id', uuidv7()))).*
      FROM indicator_version v
      JOIN current_published_version c ON c.id = v.id
      WHERE c.indicator_id = ${indicatorId}
      RETURNING id, indicator_id AS "indicatorId"
    `;
    if (draft === undefined) throw new Error(`no published version of ${indicatorId}`);
    return draft;
  }

  /** Runs `work` in a transaction that previews the version given. */
  function inPreview<T>(versionId: string, work: (tx: postgres.TransactionSql) => Promise<T>) {
    return sql.begin(async (tx) => {
      await tx`SELECT set_config('fphd.preview_version_id', ${versionId}, true)`;
      return work(tx);
    }) as Promise<T>;
  }

  beforeAll(async () => {
    testDb = await createTestDb({ template: 'seeded' });
    sql = testDb.sql;
    const published = await sql<{ id: string }[]>`
      SELECT id FROM published.indicator ORDER BY short_id LIMIT 3
    `;
    const [first, second, third] = published.map(({ id }) => id);
    if (first === undefined || second === undefined || third === undefined) {
      throw new Error('seed has too few indicators');
    }

    // The seed's indicators each have one published version and no submissions, so this gives
    // the parity tests a superseded version, a second slug and a History entry to compare.
    publishedUpdate = await draftOf(third, {
      status: 'published',
      published_at: new Date().toISOString(),
      slug: 'renamed-in-a-published-update',
      update_summary: 'Added the 2025 data.',
    });
    await sql`
      INSERT INTO indicator_version_submission
        (indicator_version_id, indicator_id, number, status, submitted_by, ended_by, ended_at,
         update_decision, update_decided_by, update_decided_at)
      VALUES (${publishedUpdate.id}, ${third}, 1, 'approved', ${ACTOR}, ${ACTOR}, now(),
        'publish_with_history', ${ACTOR}, now())
    `;

    keepsBatch = await draftOf(first, {
      name: 'A previewed name',
      update_summary: 'Renamed the indicator.',
    });

    newBatch = await draftOf(second, { upload_batch_id: null, data_table_confirmed_at: null });
    const [batch] = await sql<{ id: string }[]>`
      INSERT INTO upload_batch (indicator_id, original_filename, uploaded_by, indicator_version_id)
      VALUES (${second}, 'new.csv', ${ACTOR}, ${newBatch.id})
      RETURNING id
    `;
    await sql`UPDATE indicator_version SET upload_batch_id = ${batch?.id ?? null} WHERE id = ${newBatch.id}`;

    const [indicator] = await sql<{ id: string }[]>`
      INSERT INTO indicator (short_id, team_id)
      SELECT 999996, team_id FROM indicator WHERE id = ${first}
      RETURNING id
    `;
    if (indicator === undefined) throw new Error('inserted no indicator');
    const [version] = await sql<{ id: string }[]>`
      INSERT INTO indicator_version
      SELECT (jsonb_populate_record(NULL::indicator_version, to_jsonb(v) || ${sql.json({
        indicator_id: indicator.id,
        status: 'draft',
        published_at: null,
        name: 'A new indicator',
        slug: 'a-new-indicator-in-preview',
        upload_batch_id: null,
        data_table_confirmed_at: null,
      })}::jsonb || jsonb_build_object('id', uuidv7()))).*
      FROM indicator_version v WHERE v.id = ${keepsBatch.id}
      RETURNING id
    `;
    newIndicator = { id: version?.id ?? '', indicatorId: indicator.id };
  });

  afterAll(async () => {
    await testDb?.drop();
  });

  it('has a preview view for each published view that depends on the version', async () => {
    expect(await viewsIn(sql, 'preview')).toEqual([
      'available_data',
      'current_published_version',
      'indicator',
      'indicator_classification',
      'indicator_data_value',
      'indicator_goal',
      'indicator_slug',
      'indicator_source',
      'indicator_subtopic',
      'indicator_topic',
      'indicator_update_summary',
      'observation',
      'observation_dimension',
      'observation_note',
      'observation_range',
      'observation_series',
      'observation_series_batch',
    ]);
  });

  it('shows exactly what the published views show when no version is named', async () => {
    const names = await viewsIn(sql, 'preview');
    const differing = await sql.begin(async (tx) => {
      // Parallel workers would share the comparison's hash tables through /dev/shm, which is
      // only 64 MB in a Postgres container, and the observation views overflow it.
      await tx`SET LOCAL max_parallel_workers_per_gather = 0`;
      const found: string[] = [];
      for (const name of names) {
        const published =
          name === 'current_published_version'
            ? 'public.current_published_version'
            : `published.${name}`;
        const [row] = await tx.unsafe<{ differ: boolean }[]>(`
          SELECT EXISTS (SELECT * FROM preview.${name} EXCEPT ALL SELECT * FROM ${published})
            OR EXISTS (SELECT * FROM ${published} EXCEPT ALL SELECT * FROM preview.${name})
            AS differ
        `);
        if (row?.differ) found.push(name);
      }
      return found;
    });
    expect(differing).toEqual([]);
  });

  it('shows exactly what the published views show when the version named is published', async () => {
    const [published] = await sql<{ updated: boolean; slugs: number; summaries: number }[]>`
      SELECT
        (SELECT first_published_at < last_published_at FROM published.indicator
          WHERE id = ${publishedUpdate.indicatorId}) AS updated,
        (SELECT count(*)::int FROM published.indicator_slug
          WHERE indicator_id = ${publishedUpdate.indicatorId}) AS slugs,
        (SELECT count(*)::int FROM published.indicator_update_summary
          WHERE indicator_id = ${publishedUpdate.indicatorId}) AS summaries
    `;
    expect(published).toEqual({ updated: true, slugs: 2, summaries: 1 });

    const differing = await inPreview(publishedUpdate.id, async (tx) => {
      const names: string[] = [];
      for (const name of ['indicator', 'indicator_slug', 'indicator_update_summary']) {
        const [row] = await tx.unsafe<{ differ: boolean }[]>(`
          SELECT EXISTS (SELECT * FROM preview.${name} EXCEPT ALL SELECT * FROM published.${name})
            OR EXISTS (SELECT * FROM published.${name} EXCEPT ALL SELECT * FROM preview.${name})
            AS differ
        `);
        if (row?.differ) names.push(name);
      }
      return names;
    });
    expect(differing).toEqual([]);
  });

  it('shows the named version in place of its indicator’s published one, and leaves the rest', async () => {
    const { previewed, others } = await inPreview(keepsBatch.id, async (tx) => ({
      previewed: await tx`SELECT name FROM preview.indicator WHERE id = ${keepsBatch.indicatorId}`,
      others: await tx`
        SELECT count(*)::int AS n FROM (
          SELECT * FROM preview.indicator WHERE id <> ${keepsBatch.indicatorId}
          EXCEPT ALL SELECT * FROM published.indicator WHERE id <> ${keepsBatch.indicatorId}
        ) x
      `,
    }));
    expect(previewed).toEqual([{ name: 'A previewed name' }]);
    expect(others).toEqual([{ n: 0 }]);
  });

  it('reads the named version’s lists through the generated views', async () => {
    // The draft was copied without its topics, so the preview shows it with none.
    const published = await sql`
      SELECT topic_id FROM published.indicator_topic WHERE indicator_id = ${keepsBatch.indicatorId}
    `;
    const previewed = await inPreview(
      keepsBatch.id,
      (tx) => tx`
        SELECT topic_id FROM preview.indicator_topic WHERE indicator_id = ${keepsBatch.indicatorId}
      `,
    );
    expect(published.length).toBeGreaterThan(0);
    expect(previewed).toEqual([]);
  });

  it('dates an update as if it were published now, or at its scheduled time if that is later', async () => {
    const [published] = await sql<{ first: Date; data: Date | null }[]>`
      SELECT first_published_at AS first, data_updated_at AS data
      FROM published.indicator WHERE id = ${keepsBatch.indicatorId}
    `;
    const now = await inPreview(
      keepsBatch.id,
      (tx) => tx<{ first: Date; last: Date; data: Date | null; now: Date }[]>`
        SELECT first_published_at AS first, last_published_at AS last,
          data_updated_at AS data, now() AS now
        FROM preview.indicator WHERE id = ${keepsBatch.indicatorId}
      `,
    );
    expect(now).toEqual([
      { first: published?.first, last: now[0]?.now, data: published?.data, now: now[0]?.now },
    ]);

    const scheduled = new Date('2027-03-01T09:30:00Z');
    await sql`UPDATE indicator_version SET scheduled_publish_at = ${scheduled} WHERE id = ${keepsBatch.id}`;
    try {
      const [later] = await inPreview(
        keepsBatch.id,
        (tx) => tx<{ last: Date }[]>`
          SELECT last_published_at AS last FROM preview.indicator WHERE id = ${keepsBatch.indicatorId}
        `,
      );
      expect(later?.last).toEqual(scheduled);

      await sql`UPDATE indicator_version SET scheduled_publish_at = '2026-01-01T09:30:00Z' WHERE id = ${keepsBatch.id}`;
      const [overdue] = await inPreview(
        keepsBatch.id,
        (tx) => tx<{ last: Date; now: Date }[]>`
          SELECT last_published_at AS last, now() AS now
          FROM preview.indicator WHERE id = ${keepsBatch.indicatorId}
        `,
      );
      expect(overdue?.last).toEqual(overdue?.now);
    } finally {
      await sql`UPDATE indicator_version SET scheduled_publish_at = NULL WHERE id = ${keepsBatch.id}`;
    }
  });

  it('dates the data of an update with a new batch as if it were published now', async () => {
    const [row] = await inPreview(
      newBatch.id,
      (tx) => tx<{ data: Date; now: Date }[]>`
        SELECT data_updated_at AS data, now() AS now
        FROM preview.indicator WHERE id = ${newBatch.indicatorId}
      `,
    );
    expect(row?.data).toEqual(row?.now);
  });

  it('shows a draft of an indicator never published, first published now', async () => {
    const [published] =
      await sql`SELECT id FROM published.indicator WHERE id = ${newIndicator.indicatorId}`;
    const [row] = await inPreview(
      newIndicator.id,
      (tx) => tx<{ name: string; first: Date; last: Date; now: Date }[]>`
        SELECT name, first_published_at AS first, last_published_at AS last, now() AS now
        FROM preview.indicator WHERE id = ${newIndicator.indicatorId}
      `,
    );
    expect(published).toBeUndefined();
    expect(row).toEqual({
      name: 'A new indicator',
      first: row?.now,
      last: row?.now,
      now: row?.now,
    });
  });

  it('resolves the named version’s slug beside the published ones', async () => {
    const rows = await inPreview(
      newIndicator.id,
      (tx) =>
        tx`SELECT indicator_id FROM preview.indicator_slug WHERE slug = 'a-new-indicator-in-preview'`,
    );
    expect(rows).toEqual([{ indicator_id: newIndicator.indicatorId }]);
  });

  it('lists an update’s summary at the time it would be published, unless the core team hides it', async () => {
    const summaries = () =>
      inPreview(
        keepsBatch.id,
        (tx) => tx<{ summary: string; at: Date; now: Date }[]>`
          SELECT update_summary AS summary, published_at AS at, now() AS now
          FROM preview.indicator_update_summary
          WHERE indicator_id = ${keepsBatch.indicatorId} AND update_summary = 'Renamed the indicator.'
        `,
      );
    const [shown] = await summaries();
    expect(shown?.at).toEqual(shown?.now);

    await sql`
      INSERT INTO indicator_version_submission
        (indicator_version_id, indicator_id, number, status, submitted_by,
         update_decision, update_decided_by, update_decided_at)
      VALUES (${keepsBatch.id}, ${keepsBatch.indicatorId}, 1, 'in_review', ${ACTOR},
        'publish_without_history', ${ACTOR}, now())
    `;
    expect(await summaries()).toEqual([]);
  });

  it('keeps the read models of an indicator whose version keeps the published batch', async () => {
    const counts = (tx: postgres.Sql | postgres.TransactionSql, schemaName: string, id: string) =>
      tx.unsafe<{ areas: number; ranges: number }[]>(
        `SELECT (SELECT count(*) FROM ${schemaName}.available_data WHERE indicator_id = $1)::int AS areas,
          (SELECT count(*) FROM ${schemaName}.observation_range WHERE indicator_id = $1)::int AS ranges`,
        [id],
      );
    const [kept] = await counts(sql, 'published', keepsBatch.indicatorId);
    const [replaced] = await counts(sql, 'published', newBatch.indicatorId);
    expect(kept?.areas).toBeGreaterThan(0);
    expect(replaced?.ranges).toBeGreaterThan(0);

    expect(
      await inPreview(keepsBatch.id, (tx) => counts(tx, 'preview', keepsBatch.indicatorId)),
    ).toEqual([kept]);
    expect(
      await inPreview(newBatch.id, (tx) => counts(tx, 'preview', newBatch.indicatorId)),
    ).toEqual([{ areas: 0, ranges: 0 }]);
  });

  it('forgets the named version when its transaction ends', async () => {
    const name = sql`SELECT name FROM preview.indicator WHERE id = ${keepsBatch.indicatorId}`;
    const [published] =
      await sql`SELECT name FROM published.indicator WHERE id = ${keepsBatch.indicatorId}`;
    expect(
      await inPreview(
        keepsBatch.id,
        (tx) => tx`SELECT name FROM preview.indicator WHERE id = ${keepsBatch.indicatorId}`,
      ),
    ).toEqual([{ name: 'A previewed name' }]);
    // The same session, now with the setting empty rather than unset.
    expect(await name).toEqual([published]);
  });

  it('lets internal_api read the preview views and refuses public_api', async () => {
    const internal = testDb.connect({ login: apiLogin('internal_api'), max: 1 });
    const pub = testDb.connect({ login: apiLogin('public_api'), max: 1 });
    expect(await internal`SELECT count(*)::int AS n FROM preview.indicator`).toEqual(
      await sql`SELECT count(*)::int AS n FROM published.indicator`,
    );
    await expect(pub`SELECT count(*) FROM preview.indicator`).rejects.toThrow(
      /permission denied for schema preview/,
    );
    await expect(pub`SELECT count(*) FROM preview.current_published_version`).rejects.toThrow(
      /permission denied for schema preview/,
    );
  });
});

describe('recreating the preview views around a migration', () => {
  let testDb: TestDb;
  let sql: postgres.Sql;

  beforeAll(async () => {
    testDb = await createTestDb();
    sql = testDb.sql;
  });

  afterAll(async () => {
    await testDb?.drop();
  });

  it('lets a migration drop a column a preview view reads, and copies the new definition', async () => {
    await asOwnerGroup(sql, () =>
      withPreviewViewsRecreated(sql, async () => {
        await sql`DROP VIEW published.observation_series_batch`;
        await sql`ALTER TABLE observation_series_batch DROP COLUMN trend_values`;
        await sql`
          CREATE VIEW published.observation_series_batch AS
          SELECT b.indicator_id FROM observation_series_batch b
          JOIN current_published_version cpv ON cpv.indicator_id = b.indicator_id
          JOIN indicator_version v ON v.id = cpv.id AND v.upload_batch_id = b.upload_batch_id
        `;
      }),
    );
    const columns = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'preview' AND table_name = 'observation_series_batch'
    `;
    expect(columns).toEqual([{ column_name: 'indicator_id' }]);
  });

  it('copies a view that names current_published_version without an alias, and only that name', async () => {
    try {
      // As the owner group, which db migrate checks owns every object.
      await asOwnerGroup(sql, async () => {
        await sql`CREATE TABLE current_published_version_note (indicator_id uuid, note text)`;
        await sql`
          CREATE VIEW published.indicator_note AS
          SELECT current_published_version.indicator_id, n.note
          FROM current_published_version
          JOIN current_published_version_note n
            ON n.indicator_id = current_published_version.indicator_id
        `;
        await withPreviewViewsRecreated(sql, async () => {});
      });
      // With no search path, every relation in the definition carries its schema.
      const [view] = await sql.begin(async (tx) => {
        await tx`SET LOCAL search_path = ''`;
        return tx<{ definition: string }[]>`
          SELECT pg_catalog.pg_get_viewdef('preview.indicator_note'::pg_catalog.regclass) AS definition
        `;
      });
      expect(view?.definition).toContain('FROM (preview.current_published_version');
      expect(view?.definition).toContain('public.current_published_version_note');
      expect(view?.definition).not.toMatch(/public\.current_published_version(?!_)/);
    } finally {
      await sql`DROP TABLE current_published_version_note CASCADE`;
    }
  });

  it('recreates the preview views when the migration fails', async () => {
    await expect(
      asOwnerGroup(sql, () =>
        withPreviewViewsRecreated(sql, async () => {
          throw new Error('the migration failed');
        }),
      ),
    ).rejects.toThrow('the migration failed');
    expect(await viewsIn(sql, 'preview')).toContain('indicator');
  });

  it('fails on a hand-written preview view whose columns differ from its published view', async () => {
    await sql`
      CREATE OR REPLACE VIEW published.indicator_slug AS
      SELECT DISTINCT slug, indicator_id, 1 AS extra FROM indicator_version WHERE status = 'published'
    `;
    try {
      await expect(
        asOwnerGroup(sql, () => withPreviewViewsRecreated(sql, async () => {})),
      ).rejects.toThrow(/preview\.indicator_slug/);
    } finally {
      await sql`DROP VIEW published.indicator_slug CASCADE`;
      await sql`
        CREATE VIEW published.indicator_slug AS
        SELECT DISTINCT slug, indicator_id FROM indicator_version WHERE status = 'published'
      `;
    }
  });

  it.each([
    [
      'reads only another versioned published view',
      'SELECT i.id, i.name FROM published.indicator i',
    ],
    [
      'reads another versioned published view beside current_published_version',
      `SELECT t.topic_id, i.name
       FROM current_published_version cpv
       JOIN indicator_version_topic t ON t.indicator_version_id = cpv.id
       JOIN published.indicator i ON i.id = cpv.indicator_id`,
    ],
  ])('fails on a published view that %s', async (_shape, definition) => {
    await sql.unsafe(`CREATE VIEW published.built_on_indicator AS ${definition}`);
    try {
      await expect(createPreviewViews(sql)).rejects.toThrow(/published\.built_on_indicator/);
    } finally {
      await sql`DROP VIEW published.built_on_indicator`;
    }
  });

  it('fails on a published view that chooses versions in a way it doesn’t know', async () => {
    await sql`
      CREATE VIEW published.latest_draft AS
      SELECT indicator_id, name FROM indicator_version WHERE status = 'draft'
    `;
    try {
      await expect(createPreviewViews(sql)).rejects.toThrow(/published\.latest_draft/);
    } finally {
      await sql`DROP VIEW published.latest_draft`;
    }
  });
});
