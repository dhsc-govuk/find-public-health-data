import { type Database, schema } from '@fphd/db';
import { slugify } from '@fphd/utils/slug';
import { and, eq, ne, sql } from 'drizzle-orm';

import type { Transaction } from './database.ts';

const { indicatorVersion } = schema;

/** The parts of a version that decide the slug publishing it gives the indicator. */
export interface VersionSlugParts {
  indicatorId: string;
  name: string;
  slug: string;
}

/**
 * The slug a renamed update moves the indicator to when it is published, or null when publishing
 * it moves the indicator nowhere. A renamed update keeps the indicator's published slug until it
 * is published, and publishing it moves the indicator to the slug of its new name.
 *
 * Only a rename moves the indicator: a version whose name is the same as `previousName`, the name
 * of the published version it replaces, keeps the slug it carries, even when that slug is not the
 * slug of its name. A new indicator's first version has no previous name, and its draft already
 * carries the slug of its name.
 */
export function slugOfRename(
  version: VersionSlugParts,
  previousName: string | null,
): string | null {
  if (previousName === null || version.name === previousName) return null;
  const slug = slugify(version.name);
  return slug === version.slug ? null : slug;
}

/**
 * The slug publishing `version` would give the indicator, and `slugTaken`, the slug of its new
 * name if it could not move there. Two indicators never share a slug, so if another indicator has
 * taken the new slug since the update was renamed, the version keeps the slug it carries. A caller
 * that goes on to write the slug locks it first (see `lockSlugs`).
 */
export async function slugOnPublication(
  db: Database | Transaction,
  version: VersionSlugParts,
  previousName: string | null,
): Promise<{ slug: string; slugTaken: string | null }> {
  const wanted = slugOfRename(version, previousName);
  if (wanted === null) return { slug: version.slug, slugTaken: null };
  const [holder] = await db
    .select({ id: indicatorVersion.id })
    .from(indicatorVersion)
    .where(
      and(eq(indicatorVersion.slug, wanted), ne(indicatorVersion.indicatorId, version.indicatorId)),
    )
    .limit(1);
  return holder === undefined
    ? { slug: wanted, slugTaken: null }
    : { slug: version.slug, slugTaken: wanted };
}

/**
 * The slug the indicator would have if the version given were published now, as the preview shows
 * it. Undefined for a version that doesn't exist.
 */
export async function slugOnPublicationOf(
  db: Database | Transaction,
  versionId: string,
): Promise<string | undefined> {
  const [version] = await db
    .select({
      indicatorId: indicatorVersion.indicatorId,
      name: indicatorVersion.name,
      slug: indicatorVersion.slug,
      // The name of the indicator's currently published version, which the version would replace.
      previousName: sql<string | null>`(
        SELECT pv.name FROM current_published_version cpv
        JOIN indicator_version pv ON pv.id = cpv.id
        WHERE cpv.indicator_id = indicator_version.indicator_id
      )`,
    })
    .from(indicatorVersion)
    .where(eq(indicatorVersion.id, versionId));
  if (version === undefined) return undefined;
  return (await slugOnPublication(db, version, version.previousName)).slug;
}
