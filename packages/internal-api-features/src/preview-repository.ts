import { createVersionedViews, publishedViews, type ViewSet } from '@fphd/db';
import { pgSchema } from 'drizzle-orm/pg-core';

/**
 * The transaction-local setting that names the draft or scheduled version a preview shows. The
 * preview schema's views read it, and `db migrate` creates them.
 */
export const PREVIEW_VERSION_SETTING = 'fphd.preview_version_id';

/**
 * The views the preview reads: the preview schema's views wherever the version matters, and the
 * published views of the reference data, such as areas and units, which no version changes.
 */
export const previewViews: ViewSet = {
  ...publishedViews,
  ...createVersionedViews(pgSchema('preview')),
};
