import type postgres from 'postgres';

/**
 * The `preview` schema shows the internal apps every indicator as published, except the one
 * being previewed, which shows its draft or scheduled version as if it had been published now.
 * The transaction-local setting `fphd.preview_version_id` names that version, and
 * `fphd.preview_slug` the slug publishing it would give the indicator, which only the server can
 * work out. With no settings, every preview view shows what its published view shows.
 *
 * `db migrate` drops these views before it migrates, so that a migration can change a column a
 * preview view reads, and recreates them afterwards from the published views as they then are.
 * The generator copies each published view that chooses its versions through
 * `current_published_version`, reading `preview.current_published_version` instead. The published views
 * that choose versions some other way have a preview view written here by hand, and any other
 * such view stops the migration until it has one. A published view that reads no versioned data,
 * such as the areas or units, has no preview view: the preview reads the published one.
 *
 * Every statement runs with an empty search path, so `pg_get_viewdef` names every relation with
 * its schema, and the hand-written views name theirs too.
 */

/** The version the preview shows, or null when the transaction has not named one. */
const PREVIEW_VERSION_ID = `NULLIF(pg_catalog.current_setting('fphd.preview_version_id', true), '')::uuid`;

/**
 * The slug the previewed version would have once published, or null when the transaction has not
 * given one. A renamed update moves to the slug of its new name only when it is published.
 */
const PREVIEW_SLUG = `NULLIF(pg_catalog.current_setting('fphd.preview_slug', true), '')`;

/**
 * When the previewed version would be published: its scheduled time, or now if it has none or that
 * time has passed. The publication sweep publishes an overdue version when it next runs.
 */
const WOULD_BE_PUBLISHED_AT = `GREATEST(v.scheduled_publish_at, pg_catalog.now())`;

/**
 * The batch of an indicator's current published version, for a query that has the indicator's
 * id as `v.indicator_id`.
 */
const PUBLISHED_BATCH = `(SELECT live.upload_batch_id
    FROM public.current_published_version c
    JOIN public.indicator_version live ON live.id = c.id
    WHERE c.indicator_id = v.indicator_id)`;

/**
 * The version of each indicator the preview shows: the one the setting names, and the current
 * published version of every other indicator.
 */
const CURRENT_VERSION = `
CREATE VIEW preview.current_published_version AS
SELECT v.id, v.indicator_id
FROM public.indicator_version v
WHERE v.id = ${PREVIEW_VERSION_ID}
UNION ALL
SELECT cpv.id, cpv.indicator_id
FROM public.current_published_version cpv
WHERE cpv.indicator_id IS DISTINCT FROM (
  SELECT v.indicator_id FROM public.indicator_version v WHERE v.id = ${PREVIEW_VERSION_ID}
)`;

/**
 * The preview views of the published views that choose their versions without
 * `current_published_version`. Each must have the columns of its published view, in the same
 * order, and `createPreviewViews` checks that it does.
 */
const HAND_WRITTEN_VIEWS: Record<string, string> = {
  // The published view, on the preview's versions. The previewed version's publication dates
  // and data date are those it would have if it were published now. Its data date changes only
  // when its batch differs from the published version's, as publication does.
  indicator: `
SELECT i.id,
  i.short_id,
  CASE
    WHEN v.published_at IS NULL AND v.upload_batch_id IS NOT NULL
      AND v.upload_batch_id IS DISTINCT FROM ${PUBLISHED_BATCH}
    THEN ${WOULD_BE_PUBLISHED_AT}
    ELSE i.data_updated_at
  END AS data_updated_at,
  i.created_at,
  v.name,
  CASE WHEN v.published_at IS NULL THEN COALESCE(${PREVIEW_SLUG}, v.slug) ELSE v.slug END AS slug,
  v.value_type_id,
  v.unit_id,
  v.unit_detail,
  v.year_type,
  v.year_end_day,
  v.year_end_month,
  v.ci_method_id,
  v.polarity,
  v.update_frequency,
  v.update_frequency_reason,
  v.update_frequency_text,
  v.comparator_method_id,
  v.ci_confidence_level,
  v.definition,
  v.rationale,
  v.methodology,
  v.numerator_definition,
  v.denominator_definition,
  v.disclosure_control_detail,
  v.caveats_detail,
  v.other_notes_detail,
  v.data_source_id,
  v.updated_at,
  p.first_published_at,
  p.last_published_at
FROM public.indicator i
JOIN preview.current_published_version cv ON cv.indicator_id = i.id
JOIN public.indicator_version v ON v.id = cv.id
CROSS JOIN LATERAL (
  SELECT pg_catalog.min(t.at) AS first_published_at, pg_catalog.max(t.at) AS last_published_at
  FROM (
    SELECT pv.published_at AS at FROM public.indicator_version pv WHERE pv.indicator_id = i.id
    UNION ALL
    SELECT ${WOULD_BE_PUBLISHED_AT} WHERE v.published_at IS NULL
  ) t
) p`,

  // Every published slug, the previewed version's, and the one publishing it would give it.
  indicator_slug: `
SELECT s.slug, s.indicator_id FROM published.indicator_slug s
UNION
SELECT v.slug, v.indicator_id FROM public.indicator_version v WHERE v.id = ${PREVIEW_VERSION_ID}
UNION
SELECT ${PREVIEW_SLUG}, v.indicator_id FROM public.indicator_version v
WHERE v.id = ${PREVIEW_VERSION_ID} AND v.published_at IS NULL AND ${PREVIEW_SLUG} IS NOT NULL`,

  // The published summaries, and the previewed update's at the time it would be published. The
  // previewed summary shows unless the core team's latest decision is to publish the update
  // without visibility in history. A new indicator's first version has no summary to show.
  indicator_update_summary: `
SELECT s.indicator_id, s.published_at, s.update_summary FROM published.indicator_update_summary s
UNION ALL
SELECT v.indicator_id, ${WOULD_BE_PUBLISHED_AT}, v.update_summary
FROM public.indicator_version v
LEFT JOIN LATERAL (
  SELECT s.update_decision FROM public.indicator_version_submission s
  WHERE s.indicator_version_id = v.id
  ORDER BY s.number DESC
  LIMIT 1
) latest ON true
WHERE v.id = ${PREVIEW_VERSION_ID}
  AND v.published_at IS NULL
  AND v.update_summary IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.current_published_version c WHERE c.indicator_id = v.indicator_id
  )
  AND latest.update_decision IS DISTINCT FROM 'publish_without_history'`,

  // The read models are built only for published batches. The previewed indicator keeps its
  // published rows only while its version keeps the published batch, so an update with new data
  // never shows the old data's areas.
  available_data: `
SELECT a.indicator_id, a.area_type_id, a.area_type_name, a.area_count
FROM published.available_data a
WHERE NOT EXISTS (
  SELECT 1 FROM public.indicator_version v
  WHERE v.id = ${PREVIEW_VERSION_ID}
    AND v.indicator_id = a.indicator_id
    AND v.upload_batch_id IS DISTINCT FROM ${PUBLISHED_BATCH}
)`,

  // As available_data.
  observation_range: `
SELECT r.indicator_id, r.display_group, r.from_date, r.to_date, r.segment, r.min, r.max, r.p25,
  r.p75, r.quintile_cutoffs
FROM published.observation_range r
WHERE NOT EXISTS (
  SELECT 1 FROM public.indicator_version v
  WHERE v.id = ${PREVIEW_VERSION_ID}
    AND v.indicator_id = r.indicator_id
    AND v.upload_batch_id IS DISTINCT FROM ${PUBLISHED_BATCH}
)`,
};

/** What a published view reads, from the dependencies Postgres records for it. */
export interface PublishedViewReads {
  name: string;
  /** Reads `current_published_version`. */
  readsCurrentPublishedVersion: boolean;
  /** Reads a column of `indicator_version` that picks versions: status, published_at or indicator_id. */
  choosesVersions: boolean;
  /** Reads a table or view keyed by indicator, version or upload batch. */
  readsVersionedData: boolean;
  /** The other published views it reads. */
  readsPublishedViews: string[];
}

export interface PreviewViewPlan {
  generated: string[];
  handWritten: string[];
}

/**
 * The published views that depend on which version is visible: those that read versioned data,
 * and those that read another published view that does, however indirectly. `published.indicator`
 * is keyed by indicator id alone, so a view that reads it is found only through it.
 */
function versionedViewNames(views: PublishedViewReads[]): Set<string> {
  const direct = new Set(views.filter((view) => view.readsVersionedData).map(({ name }) => name));
  const next = new Set([
    ...direct,
    ...views
      .filter((view) => view.readsPublishedViews.some((name) => direct.has(name)))
      .map(({ name }) => name),
  ]);
  return next.size === direct.size
    ? direct
    : versionedViewNames(
        views.map((view) => ({ ...view, readsVersionedData: next.has(view.name) })),
      );
}

/**
 * Sorts the published views into those the generator copies and those with a hand-written
 * preview view. A view that reads no versioned data is in neither, because the preview reads the
 * published one. Throws for a view that chooses versions in a way the generator doesn't know:
 * any but the hand-written ones that read versioned data other than through
 * `current_published_version`, including through another published view, whose preview the copy
 * would not read.
 */
export function planPreviewViews(views: PublishedViewReads[]): PreviewViewPlan {
  const names = new Set(views.map(({ name }) => name));
  const orphans = Object.keys(HAND_WRITTEN_VIEWS).filter((name) => !names.has(name));
  if (orphans.length > 0) {
    throw new Error(`Hand-written preview views have no published view: ${orphans.join(', ')}`);
  }
  const versionedNames = versionedViewNames(views);
  const versioned = views.filter(
    ({ name }) => versionedNames.has(name) && !(name in HAND_WRITTEN_VIEWS),
  );
  const unknown = versioned.filter(
    ({ readsCurrentPublishedVersion, choosesVersions, readsPublishedViews }) =>
      !readsCurrentPublishedVersion ||
      choosesVersions ||
      readsPublishedViews.some((name) => versionedNames.has(name)),
  );
  if (unknown.length > 0) {
    throw new Error(
      `These published views choose versions in a way the preview generator doesn't know: ${unknown
        .map(({ name }) => `published.${name}`)
        .join(', ')}. Choose versions through current_published_version, reading tables rather ` +
        'than other published views, or write a preview view by hand in preview-views.ts.',
    );
  }
  return {
    generated: versioned.map(({ name }) => name).sort(),
    handWritten: Object.keys(HAND_WRITTEN_VIEWS).sort(),
  };
}

/**
 * A reference to `public.current_published_version` in a view definition, as a whole name. The
 * preview's version selector has the same name in its own schema, so a column qualified with the
 * bare relation name, such as `current_published_version.id`, still resolves once only the schema
 * is changed.
 */
const CURRENT_PUBLISHED_VERSION = /(?<![\w$."])public\.current_published_version(?![\w$"])/g;

function quoted(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

/** Drops every view in the preview schema. There are none before the first migration. */
export async function dropPreviewViews(sql: postgres.Sql): Promise<void> {
  const views = await sql<{ name: string }[]>`
    SELECT c.relname AS name
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'preview' AND c.relkind = 'v'
  `;
  if (views.length === 0) return;
  await sql.unsafe(
    `DROP VIEW ${views.map(({ name }) => `preview.${quoted(name)}`).join(', ')} CASCADE`,
  );
}

async function readPublishedViews(tx: postgres.TransactionSql): Promise<PublishedViewReads[]> {
  return tx<PublishedViewReads[]>`
    SELECT
      rel.relname AS name,
      COALESCE(pg_catalog.bool_or(ref.oid = 'public.current_published_version'::pg_catalog.regclass), false)
        AS "readsCurrentPublishedVersion",
      COALESCE(pg_catalog.bool_or(
        ref.oid = 'public.indicator_version'::pg_catalog.regclass
        AND col.attname IN ('status', 'published_at', 'indicator_id')
      ), false) AS "choosesVersions",
      COALESCE(pg_catalog.bool_or(
        ref.oid IN (
          'public.current_published_version'::pg_catalog.regclass,
          'public.indicator_version'::pg_catalog.regclass
        )
        OR EXISTS (
          SELECT 1 FROM pg_catalog.pg_attribute keyed
          WHERE keyed.attrelid = ref.oid
            AND keyed.attname IN ('indicator_id', 'indicator_version_id', 'upload_batch_id')
            AND NOT keyed.attisdropped
        )
      ), false) AS "readsVersionedData",
      COALESCE(
        pg_catalog.array_agg(DISTINCT ref.relname::text) FILTER (
          WHERE ref.relnamespace = ns.oid AND ref.relkind = 'v'
        ),
        '{}'
      ) AS "readsPublishedViews"
    FROM pg_catalog.pg_class rel
    JOIN pg_catalog.pg_namespace ns ON ns.oid = rel.relnamespace AND ns.nspname = 'published'
    JOIN pg_catalog.pg_rewrite rw ON rw.ev_class = rel.oid
    LEFT JOIN pg_catalog.pg_depend dep
      ON dep.classid = 'pg_catalog.pg_rewrite'::pg_catalog.regclass
      AND dep.objid = rw.oid
      AND dep.refclassid = 'pg_catalog.pg_class'::pg_catalog.regclass
      AND dep.refobjid <> rel.oid
    LEFT JOIN pg_catalog.pg_class ref ON ref.oid = dep.refobjid
    LEFT JOIN pg_catalog.pg_attribute col
      ON col.attrelid = ref.oid AND col.attnum = dep.refobjsubid AND dep.refobjsubid > 0
    WHERE rel.relkind = 'v'
    GROUP BY rel.relname
  `;
}

/**
 * Fails if a preview view's columns differ from its published view's in name, type or order.
 * The preview runs the public queries on these views, so a column a migration adds to a published
 * view must reach its hand-written preview view too.
 */
async function assertColumnsMatch(tx: postgres.TransactionSql, names: string[]): Promise<void> {
  const differing = await tx<{ name: string }[]>`
    WITH columns AS (
      SELECT n.nspname AS schema, c.relname AS name,
        pg_catalog.array_agg(
          a.attname || ' ' || pg_catalog.format_type(a.atttypid, a.atttypmod) ORDER BY a.attnum
        ) AS columns
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
      WHERE n.nspname IN ('published', 'preview') AND c.relname IN ${tx(names)}
      GROUP BY n.nspname, c.relname
    )
    SELECT twin.name
    FROM columns twin
    JOIN columns original ON original.name = twin.name AND original.schema = 'published'
    WHERE twin.schema = 'preview' AND twin.columns <> original.columns
  `;
  if (differing.length > 0) {
    throw new Error(
      `These preview views have different columns from their published views: ${differing
        .map(({ name }) => `preview.${name}`)
        .join(', ')}. Update them in preview-views.ts.`,
    );
  }
}

/**
 * Creates the preview views from the published views, in one transaction, and grants
 * internal_api SELECT on each. Run as the owner group, after every migration.
 */
export async function createPreviewViews(sql: postgres.Sql): Promise<PreviewViewPlan> {
  return sql.begin(async (tx) => {
    await tx`SET LOCAL search_path = ''`;
    const plan = planPreviewViews(await readPublishedViews(tx));
    await tx.unsafe(CURRENT_VERSION);
    for (const name of plan.generated) {
      const [view] = await tx<{ definition: string }[]>`
        SELECT pg_catalog.pg_get_viewdef(${`published.${quoted(name)}`}::pg_catalog.regclass)
          AS definition
      `;
      const definition = view?.definition.replaceAll(
        CURRENT_PUBLISHED_VERSION,
        'preview.current_published_version',
      );
      if (definition === undefined || definition === view?.definition) {
        throw new Error(`published.${name} does not read public.current_published_version`);
      }
      await tx.unsafe(`CREATE VIEW preview.${quoted(name)} AS ${definition}`);
    }
    for (const name of plan.handWritten) {
      await tx.unsafe(`CREATE VIEW preview.${quoted(name)} AS ${HAND_WRITTEN_VIEWS[name]}`);
    }
    await assertColumnsMatch(tx, [...plan.generated, ...plan.handWritten]);
    await tx`GRANT SELECT ON ALL TABLES IN SCHEMA preview TO internal_api`;
    return plan;
  });
}
