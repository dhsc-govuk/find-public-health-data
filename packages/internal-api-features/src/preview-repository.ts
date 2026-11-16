import { createVersionedViews, publishedViews, type ViewSet } from '@fphd/db';
import { pgSchema } from 'drizzle-orm/pg-core';

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

/**
 * The views the preview reads: the preview schema's views wherever the version matters, and the
 * published views of the reference data, such as areas and units, which no version changes.
 */
export const previewViews: ViewSet = {
  ...publishedViews,
  ...createVersionedViews(pgSchema('preview')),
};
