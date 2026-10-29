import { z } from '@fphd/config/zod';

/**
 * The version of the values a form was shown, which its save sends back so the API refuses it
 * if they have changed since. The API makes it; the web app passes it on unread.
 */
export const editVersionSchema = z.string().regex(/^[0-9a-f]{64}$/);

/** A save, which sends back the version of what its form was shown. */
export const editVersionedSchema = z.object({ version: editVersionSchema });
