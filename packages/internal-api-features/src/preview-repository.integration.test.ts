import {
  createDbFromTransaction,
  listPublishedIndicators,
  publishedViews,
  resolveIndicatorIdBySlug,
  schema,
} from '@fphd/db';
import { apiLogin, createTestDb } from '@fphd/db/testing';
import { slugOnPublicationOf } from '@fphd/internal-workflow';
import { Column, eq, is } from 'drizzle-orm';
import { getViewConfig } from 'drizzle-orm/pg-core';
import { afterAll, describe, expect, it } from 'vitest';

import { createDraftFromPublished } from './indicator-publish-repository.ts';
import { AS_ACTOR, newDraft } from './indicator-repository.testing.ts';
import { answerUpdate, openedUpdate } from './indicator-workflow.testing.ts';
import {
  PREVIEW_SLUG_SETTING,
  PREVIEW_VERSION_SETTING,
  previewViews,
} from './preview-repository.ts';

const { indicatorVersion } = schema;

const testDb = await createTestDb({ template: 'seeded' });
const internal = testDb.connect({ login: apiLogin('internal_api'), max: 1 });
const internalDb = testDb.connectDb({ login: apiLogin('internal_api') });

afterAll(async () => {
  await testDb.drop();
});

it('declares every view of the preview schema, with the columns the database gives it', async () => {
  const declared = Object.values(previewViews)
    .map((view) => getViewConfig(view))
    .filter((config) => config.schema === 'preview')
    .map((config) => ({
      name: config.name,
      columns: Object.values(config.selectedFields)
        .map((column) => (is(column, Column) ? column.name : ''))
        .sort(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const rows = await testDb.sql<{ name: string; column: string }[]>`
    SELECT table_name AS name, column_name AS column FROM information_schema.columns
    WHERE table_schema = 'preview' AND table_name <> 'current_published_version'
    ORDER BY table_name, column_name
  `;
  const actual = [...Map.groupBy(rows, ({ name }) => name)].map(([name, columns]) => ({
    name,
    columns: columns.map(({ column }) => column),
  }));

  expect(declared).toEqual(actual);
});

it('shows the version the setting names through the public repository functions', async () => {
  const [indicator] = await testDb.db
    .select({ id: publishedViews.indicator.id, slug: publishedViews.indicator.slug })
    .from(publishedViews.indicator)
    .limit(1);
  if (indicator === undefined) throw new Error('seed has no published indicator');
  const created = await createDraftFromPublished(testDb.db, indicator.id, AS_ACTOR);
  if (!created.ok) throw new Error(`no draft: ${created.reason}`);
  await testDb.db
    .update(indicatorVersion)
    .set({ name: 'A name only the preview shows', slug: 'a-slug-only-the-preview-shows' })
    .where(eq(indicatorVersion.id, created.versionId));

  const previewed = await internal.begin(async (tx) => {
    await tx`SELECT set_config(${PREVIEW_VERSION_SETTING}, ${created.versionId}, true)`;
    const db = createDbFromTransaction(tx);
    return {
      id: await resolveIndicatorIdBySlug(db, previewViews, 'a-slug-only-the-preview-shows'),
      names: (await listPublishedIndicators(db, previewViews)).map(({ name }) => name),
    };
  });
  const published = await internal.begin(async (tx) => {
    const db = createDbFromTransaction(tx);
    return {
      id: await resolveIndicatorIdBySlug(db, publishedViews, 'a-slug-only-the-preview-shows'),
      names: (await listPublishedIndicators(db, publishedViews)).map(({ name }) => name),
    };
  });

  expect(previewed.id).toBe(indicator.id);
  expect(previewed.names).toContain('A name only the preview shows');
  expect(published.id).toBeUndefined();
  expect(published.names).not.toContain('A name only the preview shows');
});

describe('the slug of a renamed update', () => {
  /** Previews the version as the server will: naming it, and the slug publishing it would give. */
  async function previewOf(versionId: string, name: string) {
    const wanted = await slugOnPublicationOf(internalDb, versionId);
    return internal.begin(async (tx) => {
      await tx`SELECT
        set_config(${PREVIEW_VERSION_SETTING}, ${versionId}, true),
        set_config(${PREVIEW_SLUG_SETTING}, ${wanted ?? ''}, true)`;
      const db = createDbFromTransaction(tx);
      return {
        wanted,
        listed: (await listPublishedIndicators(db, previewViews)).find((row) => row.name === name),
        resolved: await resolveIndicatorIdBySlug(db, previewViews, wanted ?? ''),
      };
    });
  }

  it('is the slug of its new name, as publication would give it', async () => {
    const update = await openedUpdate(testDb.db, 'Named before the preview');
    await answerUpdate(testDb.db, update, { name: 'Named by the preview' });

    const { wanted, listed, resolved } = await previewOf(update.versionId, 'Named by the preview');

    expect(wanted).toBe('named-by-the-preview');
    expect(listed).toMatchObject({ name: 'Named by the preview', slug: 'named-by-the-preview' });
    expect(resolved).toBe(update.indicatorId);
  });

  it('is the slug it carries when another indicator holds the slug of its new name', async () => {
    const update = await openedUpdate(testDb.db, 'Kept by the preview');
    await answerUpdate(testDb.db, update, { name: 'Taken from the preview' });
    await newDraft(testDb.db, 'Taken from the preview');

    const { wanted, listed } = await previewOf(update.versionId, 'Taken from the preview');

    expect(wanted).toBe('kept-by-the-preview');
    expect(listed).toMatchObject({ name: 'Taken from the preview', slug: 'kept-by-the-preview' });
  });
});
