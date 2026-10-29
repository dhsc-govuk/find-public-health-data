import { z } from '@fphd/config/zod';

/**
 * A hash of the values a form shows. The form sends it back with the save, and the API rejects
 * the save if the values have changed since. Only the API computes it. The web app passes it
 * on without reading it.
 */
export const editVersionSchema = z.string().regex(/^[0-9a-f]{64}$/);

/** A save request that includes the version its form was shown. */
export const editVersionedSchema = z.object({ version: editVersionSchema });
