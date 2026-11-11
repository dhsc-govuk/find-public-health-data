import { schema } from '@fphd/db';
import { describe, expect, it } from 'vitest';

import {
  INDICATOR_ID,
  SOURCE_ID,
  VERSION_COLUMNS,
  VERSION_ID,
  VERSION_ROW,
} from './data-migration.testing.ts';
import { batch, dataMigrationTestDb, MIGRATED, PUBLISHER } from './data-migration-db.testing.ts';

const { IMPORTED_INDICATOR_TEAM_ID } = schema;

const db = dataMigrationTestDb();
const { apply, baseline, assertRolledBack } = db;

describe('applyDataMigration', () => {
  it.each(['draft', 'publication', 'edit'])(
    'refuses an increment conflicting with a publisher %s and keeps its assignments',
    async (kind) => {
      await baseline();
      const [otherTopic] = await db.sql<
        { id: string }[]
      >`SELECT id FROM topic WHERE id <> ${db.topicId} LIMIT 1`;
      if (!otherTopic) throw new Error('Missing second core topic');
      let versionId = VERSION_ID;
      if (kind === 'edit') {
        await db.sql`UPDATE indicator_version SET updated_by = ${PUBLISHER}, has_framework = true WHERE id = ${VERSION_ID}`;
        await db.sql`DELETE FROM indicator_version_topic WHERE indicator_version_id = ${VERSION_ID}`;
      } else {
        const [created] = await db.sql<{ id: string }[]>`
          INSERT INTO indicator_version (indicator_id, status, published_at, name, slug, created_by, updated_by, has_framework)
          VALUES (${INDICATOR_ID}, ${kind === 'draft' ? 'draft' : 'published'},
            ${kind === 'draft' ? null : '2026-10-01'}, 'Publisher work', 'test-indicator', ${PUBLISHER}, ${PUBLISHER}, true)
          RETURNING id
        `;
        if (!created) throw new Error('Missing publisher version');
        versionId = created.id;
      }
      await db.sql`INSERT INTO indicator_version_topic (indicator_version_id, topic_id) VALUES (${versionId}, ${otherTopic.id})`;
      await db.sql`INSERT INTO indicator_version_classification (indicator_version_id, classification_id) VALUES (${versionId}, ${db.frameworkId})`;
      const row = [...VERSION_ROW];
      row[4] = 'Source correction';
      await expect(
        apply({ upserts: { indicator_version: { columns: VERSION_COLUMNS, rows: [row] } } }),
      ).rejects.toThrow('conflicts with FPHD publisher work on indicators: 108');
      expect(
        await db.sql`SELECT topic_id FROM indicator_version_topic WHERE indicator_version_id = ${versionId}`,
      ).toEqual([{ topic_id: otherTopic.id }]);
      expect(
        await db.sql`SELECT has_framework FROM indicator_version WHERE id = ${versionId}`,
      ).toEqual([{ has_framework: true }]);
      expect(
        await db.sql`SELECT classification_id FROM indicator_version_classification WHERE indicator_version_id = ${versionId}`,
      ).toEqual([{ classification_id: db.frameworkId }]);
      expect(await db.sql`SELECT name FROM indicator_version WHERE id = ${VERSION_ID}`).toEqual([
        { name: 'Test indicator' },
      ]);
      expect(await db.sql`SELECT count(*)::int AS count FROM data_migration`).toEqual([
        { count: 1 },
      ]);
    },
  );
  it('retains FPHD-only publications and their assignments outside migration coverage', async () => {
    await baseline();
    const [identity] = await db.sql<
      { id: string }[]
    >`INSERT INTO indicator (team_id) VALUES (${IMPORTED_INDICATOR_TEAM_ID}) RETURNING id`;
    if (!identity) throw new Error('Missing publisher indicator');
    const [publication] = await db.sql<{ id: string }[]>`
      INSERT INTO indicator_version (indicator_id, status, published_at, name, slug, created_by, updated_by, has_framework)
      VALUES (${identity.id}, 'published', '2026-10-01', 'FPHD only', 'fphd-only', ${PUBLISHER}, ${PUBLISHER}, true) RETURNING id
    `;
    if (!publication) throw new Error('Missing publisher publication');
    await db.sql`INSERT INTO indicator_version_topic (indicator_version_id, topic_id) VALUES (${publication.id}, ${db.topicId})`;
    await db.sql`INSERT INTO indicator_version_classification (indicator_version_id, classification_id) VALUES (${publication.id}, ${db.frameworkId})`;
    await apply();
    expect(
      await db.sql`SELECT has_framework FROM indicator_version WHERE id = ${publication.id}`,
    ).toEqual([{ has_framework: true }]);
    expect(
      await db.sql`SELECT topic_id FROM indicator_version_topic WHERE indicator_version_id = ${publication.id}`,
    ).toEqual([{ topic_id: db.topicId }]);
    expect(
      await db.sql`SELECT classification_id FROM indicator_version_classification WHERE indicator_version_id = ${publication.id}`,
    ).toEqual([{ classification_id: db.frameworkId }]);
    expect(await db.sql`SELECT count(*)::int AS count FROM published.indicator`).toEqual([
      { count: 2 },
    ]);
  });
  it.each([
    ['migrated', MIGRATED],
    ['publisher', PUBLISHER],
  ])('never moves an existing %s version to another indicator', async (_kind, actor) => {
    await baseline();
    const [identity] = await db.sql<{ id: string }[]>`
        INSERT INTO indicator (short_id, team_id) VALUES (109, ${IMPORTED_INDICATOR_TEAM_ID}) RETURNING id
      `;
    if (!identity) throw new Error('Missing other indicator');
    await db.sql`
        INSERT INTO indicator_version (id, indicator_id, status, published_at, name, slug, created_by, updated_by)
        VALUES (${SOURCE_ID}, ${identity.id}, 'published', '2026-01-01', 'Other indicator', 'other-indicator', ${actor}, ${actor})
      `;
    await db.sql`INSERT INTO indicator_version_topic (indicator_version_id, topic_id) VALUES (${SOURCE_ID}, ${db.topicId})`;
    const row = [...VERSION_ROW];
    row[0] = SOURCE_ID;
    await expect(
      apply({
        upserts: { indicator_version: { columns: VERSION_COLUMNS, rows: [row] } },
        deletes: { indicator: [identity.id] },
      }),
    ).rejects.toThrow('would move indicator versions to another indicator');
    expect(
      await db.sql`SELECT indicator_id, name, created_by FROM indicator_version WHERE id = ${SOURCE_ID}`,
    ).toEqual([{ indicator_id: identity.id, name: 'Other indicator', created_by: actor }]);
    expect(
      await db.sql`SELECT topic_id FROM indicator_version_topic WHERE indicator_version_id = ${SOURCE_ID}`,
    ).toEqual([{ topic_id: db.topicId }]);
    expect(await db.sql`SELECT id FROM indicator WHERE id = ${identity.id}`).toEqual([
      { id: identity.id },
    ]);
    await assertRolledBack();
  });
  it('refuses a withdrawal when its indicator has a publisher draft', async () => {
    await baseline();
    await db.sql`INSERT INTO indicator_version (indicator_id, name, slug, created_by, updated_by)
      VALUES (${INDICATOR_ID}, 'Publisher draft', 'test-indicator', ${PUBLISHER}, ${PUBLISHER})`;
    await expect(
      apply({
        deletes: { indicator: [INDICATOR_ID], indicator_version: [VERSION_ID] },
        relationships: { indicators: [], indicatorTopics: [] },
      }),
    ).rejects.toThrow('conflicts with FPHD publisher work on indicators: 108');
    await assertRolledBack();
  });
  it('allows unrelated draft-only indicators without changing them', async () => {
    await baseline();
    const [identity] = await db.sql<
      { id: string }[]
    >`INSERT INTO indicator (team_id) VALUES (${IMPORTED_INDICATOR_TEAM_ID}) RETURNING id`;
    if (!identity) throw new Error('Missing draft-only indicator');
    const [draft] = await db.sql<{ id: string }[]>`
      INSERT INTO indicator_version (indicator_id, name, slug, created_by, updated_by)
      VALUES (${identity.id}, 'Publisher draft', 'publisher-draft', ${PUBLISHER}, ${PUBLISHER}) RETURNING id
    `;
    if (!draft) throw new Error('Missing publisher draft');
    await db.sql`INSERT INTO indicator_version_topic (indicator_version_id, topic_id) VALUES (${draft.id}, ${db.topicId})`;
    await apply();
    const [row] = await db.sql<{ name: string; topics: number }[]>`
      SELECT name, (SELECT count(*)::int FROM indicator_version_topic WHERE indicator_version_id = v.id) AS topics
      FROM indicator_version v WHERE id = ${draft.id}
    `;
    expect(row).toEqual({ name: 'Publisher draft', topics: 1 });
  });
  it('refuses source versions that would overwrite a publisher draft', async () => {
    await baseline();
    const [draft] = await db.sql<{ id: string }[]>`
      INSERT INTO indicator_version (indicator_id, name, slug, created_by, updated_by)
      VALUES (${INDICATOR_ID}, 'Publisher draft', 'test-indicator', ${PUBLISHER}, ${PUBLISHER}) RETURNING id
    `;
    if (!draft) throw new Error('Missing publisher draft');
    const row = [...VERSION_ROW];
    row[0] = draft.id;
    await expect(
      apply({ upserts: { indicator_version: { columns: VERSION_COLUMNS, rows: [row] } } }),
    ).rejects.toThrow('conflicts with FPHD publisher work on indicators: 108');
    await assertRolledBack();
  });
  it('refuses source deletions that would remove a publisher draft', async () => {
    await baseline();
    const [draft] = await db.sql<{ id: string }[]>`
      INSERT INTO indicator_version (indicator_id, name, slug, created_by, updated_by)
      VALUES (${INDICATOR_ID}, 'Publisher draft', 'test-indicator', ${PUBLISHER}, ${PUBLISHER}) RETURNING id
    `;
    if (!draft) throw new Error('Missing publisher draft');
    await expect(
      apply({
        deletes: { indicator_version: [draft.id] },
        relationships: { indicators: [], indicatorTopics: [] },
      }),
    ).rejects.toThrow('would delete a non-published indicator version');
    await assertRolledBack();
    const [remaining] = await db.sql<
      { name: string }[]
    >`SELECT name FROM indicator_version WHERE id = ${draft.id}`;
    expect(remaining?.name).toBe('Publisher draft');
  });
});

// An approved draft and a scheduled one are both publisher work the package must not touch.
describe.each(['draft', 'scheduled'])('a publisher %s locked for review', (status) => {
  /** A locked unpublished version of the baseline's indicator, holding a topic the package never names. */
  async function lockedDraft(): Promise<{ draftId: string; draftTopicId: string }> {
    const [otherTopic] = await db.sql<
      { id: string }[]
    >`SELECT id FROM topic WHERE id <> ${db.topicId} LIMIT 1`;
    const [draft] = await db.sql<{ id: string }[]>`
      INSERT INTO indicator_version (indicator_id, status, name, slug, created_by, updated_by, is_locked)
      VALUES (${INDICATOR_ID}, ${status}, 'Submitted draft', 'test-indicator', ${PUBLISHER}, ${PUBLISHER}, true)
      RETURNING id
    `;
    if (!otherTopic || !draft) throw new Error('Missing locked draft fixture');
    await db.sql`INSERT INTO indicator_version_topic (indicator_version_id, topic_id) VALUES (${draft.id}, ${otherTopic.id})`;
    return { draftId: draft.id, draftTopicId: otherTopic.id };
  }

  async function topicsOf(versionId: string) {
    return db.sql`SELECT topic_id FROM indicator_version_topic WHERE indicator_version_id = ${versionId}`;
  }

  it('refuses a version upsert as publisher work, keeping the draft and its topics', async () => {
    await baseline();
    const { draftId, draftTopicId } = await lockedDraft();
    const row = [...VERSION_ROW];
    row[4] = 'Source correction';

    await expect(
      apply({
        upserts: { indicator_version: { columns: VERSION_COLUMNS, rows: [row] } },
        relationships: { indicators: [], indicatorTopics: [] },
      }),
    ).rejects.toThrow('Data migration conflicts with FPHD publisher work on indicators: 108');
    expect(await topicsOf(draftId)).toEqual([{ topic_id: draftTopicId }]);
    await assertRolledBack();
  });

  it('refuses a batch upsert under the indicator as publisher work', async () => {
    await baseline();
    await lockedDraft();

    await expect(
      apply({
        upserts: { upload_batch: batch(SOURCE_ID) },
        relationships: { indicators: [], indicatorTopics: [] },
      }),
    ).rejects.toThrow(
      'Data migration upload_batch upsert conflicts with FPHD publisher work on indicators: 108',
    );
    await assertRolledBack();
  });

  it('refuses relationships naming the indicator, keeping the draft topics', async () => {
    await baseline();
    const { draftId, draftTopicId } = await lockedDraft();

    await expect(apply()).rejects.toThrow(
      'conflicts with FPHD publisher work on indicators: 108. Resolve drafts',
    );
    expect(await topicsOf(draftId)).toEqual([{ topic_id: draftTopicId }]);
    await assertRolledBack();
  });

  it.each([
    [
      'its indicator',
      { indicator: [INDICATOR_ID], indicator_version: [VERSION_ID] },
      'Data migration indicator delete conflicts',
    ],
    [
      'its published version',
      { indicator_version: [VERSION_ID] },
      'Data migration deletion conflicts',
    ],
  ])('refuses a withdrawal of %s as publisher work', async (_, deletes, refusal) => {
    await baseline();
    await lockedDraft();

    await expect(
      apply({ deletes, relationships: { indicators: [], indicatorTopics: [] } }),
    ).rejects.toThrow(`${refusal} with FPHD publisher work on indicators: 108`);
    await assertRolledBack();
  });
});
