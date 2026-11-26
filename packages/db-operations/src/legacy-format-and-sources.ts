import type postgres from 'postgres';

/**
 * The columns a Fingertips version carries beside the service's own, which a staged version
 * table adds: the legacy ids of its single numerator and denominator source, and its one
 * disclosure control answer for the whole indicator. The service holds none of them as they are.
 */
export const LEGACY_STAGED_COLUMNS = [
  'numerator_source_id',
  'denominator_source_id',
  'disclosure_control',
  'disclosure_control_detail',
] as const;

/** The column definitions a staged version table adds for the legacy columns. */
export const LEGACY_STAGED_COLUMN_DEFINITIONS =
  'ADD COLUMN numerator_source_id uuid, ADD COLUMN denominator_source_id uuid, ' +
  'ADD COLUMN disclosure_control text, ADD COLUMN disclosure_control_detail text';

/**
 * Gives the staged versions, already inserted, the service's indicator format and sources from
 * what Fingertips holds, and answers how many source rows it wrote:
 *
 * - A version with a numerator and a denominator, each a definition that is not blank or a
 *   source, has both. The numerator takes Fingertips' disclosure control answer, and the
 *   denominator's is left unanswered.
 * - A version with only one of them has no numerator and denominator. Its one side becomes its
 *   single data value, with the disclosure control answer.
 * - A version with neither leaves the question unanswered.
 *
 * Fingertips answers disclosure control "No" where the service offers "Not applicable", so it
 * becomes that. `pairs` names the temp table mapping each legacy source id to the core
 * providers and sources, by position. The versions' earlier sources and data values go first,
 * so a version imported again holds only what it now carries.
 */
export async function applyLegacyFormatAndSources(
  tx: postgres.TransactionSql,
  staged: string,
  pairs: string,
): Promise<number> {
  await tx.unsafe(`
    DELETE FROM indicator_version_source
    WHERE indicator_version_id IN (SELECT id FROM "${staged}")
  `);
  await tx.unsafe(`
    DELETE FROM indicator_version_data_value
    WHERE indicator_version_id IN (SELECT id FROM "${staged}")
  `);
  await tx.unsafe(`
    CREATE TEMP TABLE "${staged}_format" ON COMMIT DROP AS
    SELECT s.id,
      NULLIF(btrim(s.numerator_definition), '') IS NOT NULL OR s.numerator_source_id IS NOT NULL
        AS has_numerator,
      NULLIF(btrim(s.denominator_definition), '') IS NOT NULL
        OR s.denominator_source_id IS NOT NULL AS has_denominator,
      CASE WHEN s.disclosure_control = 'no' THEN 'not-applicable' ELSE s.disclosure_control END
        AS disclosure_control,
      CASE WHEN s.disclosure_control = 'yes' THEN s.disclosure_control_detail END
        AS disclosure_control_detail
    FROM "${staged}" s
  `);
  await tx.unsafe(`
    UPDATE indicator_version v SET
      has_numerator_denominator = CASE
        WHEN f.has_numerator AND f.has_denominator THEN true
        WHEN f.has_numerator OR f.has_denominator THEN false
      END,
      numerator_definition = CASE WHEN f.has_numerator AND f.has_denominator THEN s.numerator_definition END,
      numerator_disclosure_control =
        CASE WHEN f.has_numerator AND f.has_denominator THEN f.disclosure_control END,
      numerator_disclosure_control_detail =
        CASE WHEN f.has_numerator AND f.has_denominator THEN f.disclosure_control_detail END,
      denominator_definition =
        CASE WHEN f.has_numerator AND f.has_denominator THEN s.denominator_definition END,
      denominator_disclosure_control = NULL,
      denominator_disclosure_control_detail = NULL
    FROM "${staged}_format" f
    JOIN "${staged}" s ON s.id = f.id
    WHERE v.id = f.id
  `);
  await tx.unsafe(`
    INSERT INTO indicator_version_data_value
      (indicator_version_id, position, definition, disclosure_control, disclosure_control_detail)
    SELECT f.id, 0,
      CASE WHEN f.has_numerator THEN s.numerator_definition ELSE s.denominator_definition END,
      f.disclosure_control, f.disclosure_control_detail
    FROM "${staged}_format" f
    JOIN "${staged}" s ON s.id = f.id
    WHERE f.has_numerator <> f.has_denominator
  `);
  const calculationParts = await tx.unsafe(`
    INSERT INTO indicator_version_source
      (indicator_version_id, part, position, provider_id, source_id)
    SELECT s.id, p.part, m.position, m.provider_id, m.source_id
    FROM "${staged}" s
    JOIN "${staged}_format" f ON f.id = s.id AND f.has_numerator AND f.has_denominator
    CROSS JOIN LATERAL (
      VALUES ('numerator', s.numerator_source_id), ('denominator', s.denominator_source_id)
    ) AS p (part, legacy_id)
    JOIN "${pairs}" m ON m.legacy_id = p.legacy_id
  `);
  const dataValues = await tx.unsafe(`
    INSERT INTO indicator_version_source
      (indicator_version_id, part, position, provider_id, source_id, data_value_position)
    SELECT s.id, 'data-value', m.position, m.provider_id, m.source_id, 0
    FROM "${staged}" s
    JOIN "${staged}_format" f ON f.id = s.id AND f.has_numerator <> f.has_denominator
    JOIN "${pairs}" m ON m.legacy_id = COALESCE(s.numerator_source_id, s.denominator_source_id)
  `);

  return calculationParts.count + dataValues.count;
}
