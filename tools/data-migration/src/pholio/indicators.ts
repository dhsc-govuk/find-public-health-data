import { countIsNumerator as countIsNumeratorOf } from '@fphd/utils/value-type-and-unit';

import { translateFrequency, translatePolarity } from '../fingertips-lookups.ts';
import { notesAndCaveats } from '../notes-and-caveats.ts';
import { plainTextFromHtml } from '../plain-text.ts';
import { indicatorAnalyticalSettings, type SourceGroupingSetting } from './analytical-settings.ts';
import type { PholioExportOptions } from './context.ts';
import { uploadBatchId } from './ids.ts';
import { INDICATOR_NAME_MAPPINGS, reviewedIndicatorName } from './indicator-names.ts';
import type { PholioRow } from './source.ts';
import { queryPholio } from './source.ts';
import { TableWriter } from './table-writer.ts';
import { unitValues, unknownUnits, unknownValueTypes, valueTypeId } from './value-type-and-unit.ts';
import { YEAR_TYPES, yearTypeValues } from './year-type.ts';

interface CiLevelRow extends PholioRow {
  IndicatorID: number;
  ci_confidence_level: string;
}

interface IndicatorMetaRow extends PholioRow {
  IndicatorID: number;
  Name: string | null;
  ValueTypeName: string | null;
  UnitName: string | null;
  YearTypeName: string | null;
  CIMethodID: number | null;
  EnteredAt: Date;
  OwnerProfileId: number | null;
}

interface TextValuesRow extends PholioRow {
  IndicatorID: number;
  Definition: string | null;
  Rationale: string | null;
  Methodology: string | null;
  NumeratorDefinition: string | null;
  DenominatorDefinition: string | null;
  DataSourceID: number | null;
  NumeratorSourceID: number | null;
  DenominatorSourceID: number | null;
  DisclosureControl: string | null;
  Caveats: string | null;
  Notes: string | null;
}

/** Exports indicator, indicator_version and upload_batch from Pholio. */
export async function exportIndicators(context: PholioExportOptions) {
  const { pool, outDir, excludedIndicators } = context;
  const indicatorIds = new Set<number>();
  const indicatorNames = new Map<number, string>();
  const indicatorEnteredAt = new Map<number, string>();
  const countIsNumerator = new Set<number>();

  const selected = new Set(
    context.indicatorSelection.kind === 'approved' ? context.indicatorSelection.indicators : [],
  );
  const excluded = new Set(excludedIndicators);
  // Always exclude the one test indicator the alpha migration hard-coded.
  excluded.add(94204);

  const analyticalRows = await queryPholio<SourceGroupingSetting>(
    pool,
    `
    SELECT g.IndicatorID,g.GroupID,gm.ProfileId,g.PolarityID,g.ComparatorMethodID
    FROM dbo.[Grouping] g LEFT JOIN dbo.GroupingMetadata gm ON gm.GroupID=g.GroupID
  `,
  );
  const polarityNames = await queryPholio<{ id: number; name: string }>(
    pool,
    'SELECT PolarityID AS id, Polarity AS name FROM dbo.L_Polarity',
  );
  const polarityNameById = new Map(polarityNames.map((row) => [row.id, row.name]));
  // Pre-compute frequency name for id=1 (the only value used). Column is Name.
  const freqRows = await queryPholio<{ id: number; name: string }>(
    pool,
    'SELECT FrequencyID AS id, Name AS name FROM dbo.CIA_L_Frequency WHERE FrequencyID = 1',
  );
  const annualFrequencyName = freqRows[0]?.name ?? 'Annual';

  // Pre-compute CI confidence level per indicator from CoreDataSet.
  const ciLevelRows = await queryPholio<CiLevelRow>(
    pool,
    `SELECT IndicatorID,
       CASE
         WHEN MAX(CASE WHEN LowerCI95 != -1 OR UpperCI95 != -1 THEN 1 ELSE 0 END) = 1
          AND MAX(CASE WHEN LowerCI99_8 != -1 OR UpperCI99_8 != -1 THEN 1 ELSE 0 END) = 1 THEN 'both'
         WHEN MAX(CASE WHEN LowerCI99_8 != -1 OR UpperCI99_8 != -1 THEN 1 ELSE 0 END) = 1 THEN '99.8'
         WHEN MAX(CASE WHEN LowerCI95 != -1 OR UpperCI95 != -1 THEN 1 ELSE 0 END) = 1 THEN '95'
         ELSE NULL
       END AS ci_confidence_level
     FROM dbo.CoreDataSet
     GROUP BY IndicatorID
     HAVING MAX(CASE WHEN LowerCI95 != -1 OR UpperCI95 != -1 THEN 1 ELSE 0 END) = 1
         OR MAX(CASE WHEN LowerCI99_8 != -1 OR UpperCI99_8 != -1 THEN 1 ELSE 0 END) = 1`,
  );
  const ciLevelById = new Map<number, string>();
  for (const row of ciLevelRows) {
    if (row.ci_confidence_level) ciLevelById.set(row.IndicatorID, row.ci_confidence_level);
  }

  // Load indicator metadata base columns.
  const metaRows = await queryPholio<IndicatorMetaRow>(
    pool,
    `SELECT
       im.IndicatorID,
       im.OwnerProfileId,
       imtv.[1_Name] AS Name,
       ISNULL(vt.ValueType, CONCAT('Unknown value type ', im.ValueTypeID)) AS ValueTypeName,
       ISNULL(u.Unit, CONCAT('Unknown unit ', im.UnitID)) AS UnitName,
       yt.YearType AS YearTypeName,
       im.CIMethodID,
       im.DateEnteredInPHOLIO AS EnteredAt
     FROM dbo.IndicatorMetadata im
     LEFT JOIN dbo.IndicatorMetadataTextValues imtv
       ON im.IndicatorID = imtv.IndicatorID AND imtv.ProfileId IS NULL
     LEFT JOIN dbo.L_ValueTypes vt ON vt.ValueTypeID = im.ValueTypeID
     LEFT JOIN dbo.L_Units u ON u.UnitID = im.UnitID
     LEFT JOIN dbo.L_YearTypes yt ON yt.YearTypeID = im.YearTypeID
     WHERE im.IndicatorID != 94204`,
  );

  const selectedRows = metaRows.filter(
    (row) =>
      !excluded.has(row.IndicatorID) &&
      (context.indicatorSelection.kind === 'development-snapshot' || selected.has(row.IndicatorID)),
  );
  for (const row of selectedRows)
    indicatorNames.set(
      row.IndicatorID,
      reviewedIndicatorName(row.IndicatorID, row.Name ?? `Indicator ${row.IndicatorID}`),
    );
  const unmappableValueTypes = unknownValueTypes(
    selectedRows.map((row) => row.ValueTypeName ?? 'Count'),
  );
  if (unmappableValueTypes.length)
    throw new Error(`Cannot translate value types: ${unmappableValueTypes.join(', ')}`);
  const unmappableUnits = unknownUnits(selectedRows.map((row) => row.UnitName ?? 'No unit'));
  if (unmappableUnits.length)
    throw new Error(`Cannot translate units: ${unmappableUnits.join(', ')}`);
  const unmappableYearTypes = selectedRows
    .map((row) => row.YearTypeName)
    .filter((name) => name !== null && !(name in YEAR_TYPES));
  if (unmappableYearTypes.length)
    throw new Error(`Cannot translate year types: ${unmappableYearTypes.join(', ')}`);

  const uploadRows = await queryPholio<{ IndicatorID: number; LastUploadedAt: Date }>(
    pool,
    `SELECT d.IndicatorID, MAX(u.DateCreated) AS LastUploadedAt
     FROM (
       SELECT DISTINCT IndicatorID, UploadBatchId
       FROM dbo.CoreDataSet
       WHERE UploadBatchId IS NOT NULL
     ) d
     INNER JOIN dbo.UploadJob u ON u.Guid = CONVERT(varchar(36), d.UploadBatchId)
     WHERE u.Status = 1000
     GROUP BY d.IndicatorID`,
  );
  const dataUpdatedAtById = new Map(
    uploadRows.map((row) => [row.IndicatorID, row.LastUploadedAt.toISOString()]),
  );

  // Load prose text values for indicator_metadata (ProfileId IS NULL rows).
  const textRows = await queryPholio<TextValuesRow>(
    pool,
    `SELECT
       imtv.IndicatorID,
       CAST(imtv.[3_Definition] AS nvarchar(max)) AS Definition,
       CAST(imtv.[4_Rationale] AS nvarchar(max)) AS Rationale,
       CAST(imtv.[9_IndMethod] AS nvarchar(max)) AS Methodology,
       CAST(imtv.[13_CountDefinition] AS nvarchar(max)) AS NumeratorDefinition,
       CAST(imtv.[15_DenomDefinition] AS nvarchar(max)) AS DenominatorDefinition,
       imtv.[41_DataSourceID] AS DataSourceID,
       imtv.[42_CountSourceID] AS NumeratorSourceID,
       imtv.[43_DenomSourceID] AS DenominatorSourceID,
       CAST(imtv.[16_DiscControl] AS nvarchar(max)) AS DisclosureControl,
       CAST(imtv.[17_Caveats] AS nvarchar(max)) AS Caveats,
       CAST(imtv.[22_Notes] AS nvarchar(max)) AS Notes
     FROM dbo.IndicatorMetadataTextValues imtv
     WHERE imtv.ProfileId IS NULL`,
  );
  const textById = new Map<number, TextValuesRow>();
  for (const row of textRows) textById.set(row.IndicatorID, row);

  const sourceIds = new Set(metaRows.map((row) => row.IndicatorID));
  if (context.indicatorSelection.kind === 'approved') {
    const missing = [...selected].filter((id) => !sourceIds.has(id) || id === 94204);
    if (missing.length)
      throw new Error(
        `Approved indicators missing from Pholio or reserved for tests: ${missing.join(', ')}`,
      );
  }
  const excludedNonApprovedIndicators =
    context.indicatorSelection.kind === 'approved'
      ? metaRows.filter((row) => row.IndicatorID !== 94204 && !selected.has(row.IndicatorID)).length
      : 0;
  const analyticalById = new Map(
    selectedRows.map((row) => {
      const id = row.IndicatorID;
      const { polarityId, comparatorMethodId } = indicatorAnalyticalSettings(
        id,
        row.OwnerProfileId,
        analyticalRows,
      );
      const polarityName = polarityId === null ? null : polarityNameById.get(polarityId);
      if (polarityName === undefined)
        throw new Error(`Indicator ${id}: no polarity name for polarity_id ${polarityId}`);
      const polarity = polarityName === null ? null : translatePolarity(polarityName);
      return [id, { polarity, comparatorMethodId }] as const;
    }),
  );
  const indicatorWriter = new TableWriter(outDir, 'indicator');
  const versionWriter = new TableWriter(outDir, 'indicator_version');
  const batchWriter = new TableWriter(outDir, 'upload_batch');

  // Sort by IndicatorID ascending so TableWriter id-order check passes.
  metaRows.sort((a, b) => a.IndicatorID - b.IndicatorID);

  for (const row of metaRows) {
    const id = row.IndicatorID;
    if (excluded.has(id)) continue;
    if (context.indicatorSelection.kind === 'approved' && !selected.has(id)) continue;

    const name = indicatorNames.get(id);
    if (name === undefined) throw new Error(`Indicator ${id}: missing reviewed name`);
    const analytical = analyticalById.get(id);
    if (analytical === undefined)
      throw new Error(`Indicator ${id}: missing validated analytical settings`);
    const { polarity, comparatorMethodId } = analytical;
    const updateFrequency = translateFrequency(annualFrequencyName);

    const vtName = row.ValueTypeName ?? 'Count';
    const resolvedValueTypeId = valueTypeId(vtName);
    const unitName = row.UnitName ?? 'No unit';
    const { unit_id: resolvedUnitId, unit_detail: resolvedUnitDetail } = unitValues(unitName);
    const yearTypeName = row.YearTypeName;
    const yearTypeEntry = yearTypeName ? yearTypeValues(yearTypeName) : null;
    const ciLevel = ciLevelById.get(id) ?? null;
    const text = textById.get(id) ?? null;
    const definition = text?.Definition == null ? null : plainTextFromHtml(text.Definition);
    const rationale = text?.Rationale == null ? null : plainTextFromHtml(text.Rationale);
    const methodology = text?.Methodology == null ? null : plainTextFromHtml(text.Methodology);
    const numeratorDefinition =
      text?.NumeratorDefinition == null ? null : plainTextFromHtml(text.NumeratorDefinition);
    const denominatorDefinition =
      text?.DenominatorDefinition == null ? null : plainTextFromHtml(text.DenominatorDefinition);
    const dataSourceId = text?.DataSourceID ?? null;
    const numeratorSourceId = text?.NumeratorSourceID ?? null;
    const denominatorSourceId = text?.DenominatorSourceID ?? null;
    const nc = notesAndCaveats({
      disclosureControl: text?.DisclosureControl ?? null,
      caveats: text?.Caveats ?? null,
      notes: text?.Notes ?? null,
    });

    const enteredAt = row.EnteredAt.toISOString();
    await indicatorWriter.write({
      id,
      created_at: enteredAt,
      data_updated_at: dataUpdatedAtById.get(id) ?? null,
    });

    await versionWriter.write({
      id,
      indicator_id: id,
      status: 'published',
      published_at: enteredAt,
      scheduled_publish_at: null,
      upload_batch_id: uploadBatchId(id),
      data_table_confirmed_at: enteredAt,
      name,
      slug: null,
      value_type_id: resolvedValueTypeId,
      standard_population: null,
      standard_population_detail: null,
      unit_id: resolvedUnitId,
      unit_detail: resolvedUnitDetail,
      sexes: null,
      age_type: null,
      specific_age: null,
      specific_age_unit: null,
      age_detail: null,
      period_type: yearTypeEntry?.period_type ?? null,
      year_type: yearTypeEntry?.year_type ?? null,
      year_end_day: yearTypeEntry?.year_end_day ?? null,
      year_end_month: yearTypeEntry?.year_end_month ?? null,
      polarity,
      has_data_quality_issues: null,
      definition,
      rationale,
      numerator_definition: numeratorDefinition,
      denominator_definition: denominatorDefinition,
      data_source_id: dataSourceId,
      methodology,
      calculated_by: null,
      calculated_by_detail: null,
      ci_method_id: row.CIMethodID ?? null,
      has_ci_method_modifications: null,
      ci_method_modifications_detail: null,
      ci_method_detail: null,
      ci_confidence_level: ciLevel,
      comparator_method_id: comparatorMethodId,
      has_goal_benchmark: null,
      goal_lower_value: null,
      goal_upper_value: null,
      goal_polarity: null,
      goal_policy_detail: null,
      disclosure_control: nc.disclosure_control,
      disclosure_control_detail: nc.disclosure_control_detail,
      has_rounding: nc.has_rounding,
      rounding_detail: nc.rounding_detail,
      has_caveats: nc.has_caveats,
      caveats_detail: nc.caveats_detail,
      has_other_notes: nc.has_other_notes,
      other_notes_detail: nc.other_notes_detail,
      has_links: null,
      has_risk_factor: null,
      has_framework: null,
      has_custom_copyright: null,
      custom_copyright_detail: null,
      has_custom_data_reuse: null,
      custom_data_reuse_detail: null,
      update_frequency: updateFrequency,
      variation: null,
      quality_assurance: null,
      has_source_data_issues: null,
      source_data_issues_detail: null,
      ci_method_justification: null,
      data_sources_justification: null,
      inequalities_included: null,
      has_exclusions: null,
      exclusions_detail: null,
      has_automation: null,
      automation_detail: null,
      sponsors_and_stakeholders: null,
      has_reviewer_comments: null,
      reviewer_comments_detail: null,
      created_at: enteredAt,
      updated_at: enteredAt,
      created_by: 'pholio-migration',
      updated_by: 'pholio-migration',
      numerator_source_id: numeratorSourceId,
      denominator_source_id: denominatorSourceId,
    });

    const batchId = uploadBatchId(id);
    await batchWriter.write({
      id: batchId,
      indicator_id: id,
      indicator_version_id: id,
      original_filename: 'pholio-migration',
      uploaded_by: 'pholio-migration',
      uploaded_at: enteredAt,
      status: 'processed',
      validation_result: null,
      superseded_by_id: null,
    });

    indicatorIds.add(id);
    indicatorEnteredAt.set(id, enteredAt);
    if (countIsNumeratorOf(resolvedValueTypeId, id)) countIsNumerator.add(id);
  }

  return {
    indicatorIds,
    indicatorNames,
    indicatorNameMappings: INDICATOR_NAME_MAPPINGS.filter(({ fingertipsId }) =>
      indicatorIds.has(fingertipsId),
    ),
    indicatorEnteredAt,
    countIsNumerator,
    excludedNonApprovedIndicators,
    tables: {
      indicator: await indicatorWriter.close(),
      indicator_version: await versionWriter.close(),
      upload_batch: await batchWriter.close(),
    },
  };
}
