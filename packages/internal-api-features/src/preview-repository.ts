import {
  createRepositoriesOn,
  createVersionedViews,
  type Database,
  type DatabaseReader,
  publishedViews,
  type Repositories,
  type RunRead,
  schema,
  type ViewSet,
} from '@fphd/db';
import { slugOnPublicationOf } from '@fphd/internal-workflow';
import type { IndicatorDataState } from '@fphd/utils/indicator-page';
import { and, eq, exists, sql } from 'drizzle-orm';
import { pgSchema, uuid } from 'drizzle-orm/pg-core';

const { indicatorVersion, isUnpublished } = schema;

/**
 * The transaction-local setting that names the draft or scheduled version a preview shows. The
 * preview schema's views read it, and `db migrate` creates them.
 */
export const PREVIEW_VERSION_SETTING = 'fphd.preview_version_id';

/**
 * The transaction-local setting that gives the slug publishing the previewed version would give
 * the indicator, from `slugOnPublicationOf`. The preview's indicator and slug views show it in
 * place of the slug the version carries.
 */
export const PREVIEW_SLUG_SETTING = 'fphd.preview_slug';

const previewSchema = pgSchema('preview');

/**
 * The views the preview reads: the preview schema's views wherever the version matters, and the
 * published views of the reference data, such as areas and units, which no version changes.
 */
export const previewViews: ViewSet = {
  ...publishedViews,
  ...createVersionedViews(previewSchema),
};

/** The version of each indicator the preview shows: the previewed one's, and the published rest. */
const previewCurrentVersion = previewSchema
  .view('current_published_version', {
    id: uuid('id').notNull(),
    indicatorId: uuid('indicator_id').notNull(),
  })
  .existing();

/** The version a preview shows, and the slug publishing it would give the indicator. */
export interface PreviewVersion {
  id: string;
  slug: string;
}

/**
 * The indicator's draft or scheduled version, which its preview shows, or undefined when it has
 * neither.
 */
export async function findPreviewVersion(
  db: Database,
  indicatorId: string,
): Promise<PreviewVersion | undefined> {
  const [version] = await db
    .select({ id: indicatorVersion.id })
    .from(indicatorVersion)
    .where(
      and(eq(indicatorVersion.indicatorId, indicatorId), isUnpublished(indicatorVersion.status)),
    );
  if (version === undefined) return undefined;
  const slug = await slugOnPublicationOf(db, version.id);
  return slug === undefined ? undefined : { id: version.id, slug };
}

/**
 * Whether the preview can show an indicator's data. Data is ready once its batch has read models,
 * which means a row in `observation_series_batch`. In this pass only a published batch has them.
 */
async function findDataState(
  db: DatabaseReader,
  indicatorId: string,
): Promise<IndicatorDataState | undefined> {
  const { observationSeriesBatch } = previewViews;
  const [row] = await db
    .select({
      uploaded: sql<boolean>`${indicatorVersion.uploadBatchId} IS NOT NULL`,
      ready: exists(
        db
          .select({ one: sql`1` })
          .from(observationSeriesBatch)
          .where(eq(observationSeriesBatch.indicatorId, indicatorId)),
      ),
    })
    .from(previewCurrentVersion)
    .innerJoin(indicatorVersion, eq(indicatorVersion.id, previewCurrentVersion.id))
    .where(eq(previewCurrentVersion.indicatorId, indicatorId));
  if (row === undefined) return undefined;
  if (!row.uploaded) return 'no-upload';
  return row.ready ? 'ready' : 'read-models-missing';
}

/** The public repositories on the preview's views, and what only the preview asks. */
export interface PreviewRepositories extends Repositories {
  /** Whether the preview can show the indicator's data, or undefined for one it doesn't show. */
  findDataState(indicatorId: string): Promise<IndicatorDataState | undefined>;
}

/**
 * The repositories a preview of `version` reads through. Each method runs in a short transaction
 * of its own that first names the version and its slug in transaction-local settings, so the
 * settings never outlive the read on a pooled connection. No read is shared between requests,
 * because what a read returns depends on the version as well as its arguments.
 */
export function createPreviewRepositories(
  db: Database,
  version: PreviewVersion,
): PreviewRepositories {
  const run: RunRead = (read) =>
    db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT set_config(${PREVIEW_VERSION_SETTING}, ${version.id}, true), set_config(${PREVIEW_SLUG_SETTING}, ${version.slug}, true)`,
      );
      return read(tx);
    });
  return {
    ...createRepositoriesOn(run, previewViews),
    findDataState: (indicatorId) => run((tx) => findDataState(tx, indicatorId)),
  };
}
