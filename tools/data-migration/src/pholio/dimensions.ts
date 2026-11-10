import type { PholioSource } from './context.ts';
import {
  AGE_DIMENSION_TYPE_ID,
  ageDimensionValueId,
  broadGroupDimensionValueId,
  categoryDimensionTypeId,
  categoryDimensionValueId,
  compoundAgeDimensionValueId,
  SEX_DIMENSION_TYPE_ID,
  sexDimensionValueId,
} from './ids.ts';
import type { PholioRow } from './source.ts';
import { queryPholio } from './source.ts';
import type { ExportRow } from './table-writer.ts';
import { TableWriter } from './table-writer.ts';

interface L_CategoryType extends PholioRow {
  CategoryTypeID: number;
  Name: string;
}

interface L_Age extends PholioRow {
  AgeID: number;
  Age: string;
  Sequence: number;
  MinYears: number | null;
  MaxYears: number | null;
}

interface L_Category extends PholioRow {
  CategoryTypeID: number;
  CategoryID: number;
  Name: string;
  Sequence: number | null;
}

// Corrections from fix-dimension-types.sql, keyed by CategoryTypeID instead of IDENTITY id.
// Each entry contains the fields the script overrides.
interface DimTypeCorrection {
  dimension_class?: string;
  classification_scheme?: string;
}

export const DIM_TYPE_CORRECTIONS: ReadonlyMap<number, DimTypeCorrection> = new Map([
  // Ethnicity classification_scheme fixes
  [15, { classification_scheme: 'binary' }],
  [4, { classification_scheme: 'ONS-7cat' }],
  [16, { classification_scheme: 'ONS-6cat' }],
  [17, { classification_scheme: 'ONS-17cat' }],
  [18, { classification_scheme: 'ONS-18cat' }],
  [33, { classification_scheme: 'ONS-5cat' }],
  [43, { classification_scheme: 'ONS-3cat' }],
  [49, { classification_scheme: 'ONS-12cat' }],
  [51, { classification_scheme: 'ONS-9cat' }],
  [110, { classification_scheme: 'NHS-5cat-excl' }],
  [111, { classification_scheme: 'NHS-6cat-incl' }],
  [129, { classification_scheme: 'ONS-4cat' }],
  [140, { classification_scheme: 'ONS-5cat-alt' }],
  [152, { classification_scheme: 'ONS-19cat' }],
  [154, { classification_scheme: 'ONS-16cat-incl' }],
  [29, { classification_scheme: 'ONS-5cat-excl' }],
  [155, { classification_scheme: 'ONS-11cat' }],
  [228, { classification_scheme: 'ONS-2021-6cat' }],
  // Disability
  [27, { classification_scheme: 'disability-2cat' }],
  [95, { classification_scheme: 'disability-alt' }],
  // Sexuality
  [24, { classification_scheme: 'sexuality-default' }],
  [58, { classification_scheme: 'sexuality-2cat' }],
  [7, { classification_scheme: 'sexuality-4cat' }],
  [142, { classification_scheme: 'sexuality-3cat' }],
  // Religion
  [112, { classification_scheme: 'religion-default' }],
  [19, { classification_scheme: 'religion-8cat' }],
  [20, { classification_scheme: 'religion-9cat' }],
  // Deprivation gaps
  [91, { classification_scheme: 'IDACI' }],
  [71, { classification_scheme: 'IMD-trend' }],
  [158, { classification_scheme: 'IMD-trend' }],
  [214, { classification_scheme: 'IMD-trend' }],
  [219, { classification_scheme: 'IMD-trend' }],
  [64, { classification_scheme: 'decile-boundaries' }],
  // demographic fixes (class was wrongly 'inequality'; the initial CASE already set the correct
  // classification_scheme — the fix script's scheme overrides were not applied to fphd_new)
  [130, { dimension_class: 'demographic' }],
  [151, { dimension_class: 'demographic' }],
  [13, { dimension_class: 'demographic' }],
  [164, { dimension_class: 'demographic' }],
  [229, { dimension_class: 'demographic' }],
  [11, { dimension_class: 'demographic' }],
  [226, { dimension_class: 'demographic' }],
  [22, { dimension_class: 'demographic' }],
  [131, { dimension_class: 'demographic' }],
  [30, { dimension_class: 'demographic' }],
  [52, { dimension_class: 'demographic' }],
  [103, { dimension_class: 'demographic' }],
  [34, { dimension_class: 'demographic' }],
  [109, { dimension_class: 'demographic' }],
  [45, { dimension_class: 'demographic' }],
  [133, { dimension_class: 'demographic' }],
  [239, { dimension_class: 'demographic' }],
  [178, { dimension_class: 'demographic' }],
  [227, { dimension_class: 'demographic' }],
  [12, { dimension_class: 'demographic' }],
  [36, { dimension_class: 'demographic' }],
  [21, { dimension_class: 'demographic' }],
  [137, { dimension_class: 'demographic' }],
  [108, { dimension_class: 'demographic' }],
  [5, { dimension_class: 'demographic' }],
  [127, { dimension_class: 'demographic' }],
  [126, { dimension_class: 'demographic' }],
  [55, { dimension_class: 'demographic' }],
  [47, { dimension_class: 'demographic' }],
  [180, { dimension_class: 'demographic' }],
  [238, { dimension_class: 'demographic' }],
  [132, { dimension_class: 'demographic' }],
  [57, { dimension_class: 'demographic' }],
  [94, { dimension_class: 'demographic' }],
  [225, { dimension_class: 'demographic' }],
  [141, { dimension_class: 'demographic' }],
  [26, { dimension_class: 'demographic' }],
  [136, { dimension_class: 'demographic' }],
  [128, { dimension_class: 'demographic' }],
  [46, { dimension_class: 'demographic' }],
  [166, { dimension_class: 'demographic' }],
  [56, { dimension_class: 'demographic' }],
  [242, { dimension_class: 'demographic' }],
  [125, { dimension_class: 'demographic' }],
  [32, { dimension_class: 'demographic' }],
  [235, { dimension_class: 'demographic' }],
  [59, { dimension_class: 'demographic' }],
  [150, { dimension_class: 'demographic' }],
  [54, { dimension_class: 'demographic' }],
  [37, { dimension_class: 'demographic' }],
  [165, { dimension_class: 'demographic' }],
  [23, { dimension_class: 'demographic' }],
  [143, { dimension_class: 'demographic' }],
  [25, { dimension_class: 'demographic' }],
  [53, { dimension_class: 'demographic' }],
  // clinical fixes (class was wrongly 'inequality')
  [181, { dimension_class: 'clinical' }],
  [42, { dimension_class: 'clinical' }],
  [93, { dimension_class: 'clinical' }],
  [14, { dimension_class: 'clinical' }],
  [241, { dimension_class: 'clinical' }],
  [240, { dimension_class: 'clinical' }],
  [102, { dimension_class: 'clinical' }],
  [92, { dimension_class: 'clinical' }],
  [179, { dimension_class: 'clinical' }],
  [230, { dimension_class: 'clinical' }],
]);

// Ethnicity types that get synthetic "broad group" parent dimension_values.
// Each entry maps (CategoryTypeID → broad group definitions).
const ETHNICITY_BROAD_GROUPS: ReadonlyMap<
  number,
  ReadonlyArray<{ name: string; minCat: number; maxCat: number }>
> = new Map([
  [
    17,
    [
      { name: 'White', minCat: 1, maxCat: 3 },
      { name: 'Mixed/Multiple', minCat: 4, maxCat: 7 },
      { name: 'Asian', minCat: 8, maxCat: 11 },
      { name: 'Black', minCat: 12, maxCat: 14 },
      { name: 'Other', minCat: 15, maxCat: 17 },
    ],
  ],
  [
    18,
    [
      { name: 'White', minCat: 1, maxCat: 4 },
      { name: 'Mixed/Multiple', minCat: 5, maxCat: 8 },
      { name: 'Asian', minCat: 9, maxCat: 12 },
      { name: 'Black', minCat: 13, maxCat: 15 },
      { name: 'Other', minCat: 16, maxCat: 18 },
    ],
  ],
  [
    152,
    [
      { name: 'Asian', minCat: 1, maxCat: 5 },
      { name: 'Black', minCat: 6, maxCat: 8 },
      { name: 'Mixed/Multiple', minCat: 9, maxCat: 12 },
      { name: 'White', minCat: 13, maxCat: 17 },
      { name: 'Other', minCat: 18, maxCat: 19 },
    ],
  ],
]);

// IMD-trend decile types that need the fix-deprivation-orphans.sql treatment.
// These pairs were missed by the main migration's scheme-matching because their
// classification_scheme was originally NULL and was only set by fix-dimension-types.sql.
// key = decile CategoryTypeID, value = matching quintile CategoryTypeID
const DEPRIVATION_ORPHAN_DECILE_TO_QUINTILE: ReadonlyMap<number, number> = new Map([
  [71, 158], // LSOA11 deciles within area (IMD trend) → LSOA11 quintiles within area (IMD trend)
  [214, 219], // LSOA21 deciles within area (IMD trend) → LSOA21 quintiles within area (IMD trend)
]);

// ─── pure transform helpers ────────────────────────────────────────────────────

export function dimensionClass(name: string): string {
  if (
    /Condition|Exposure|HIV|intensity therap|Long term|Phase type|Severe mental|Intervention/.test(
      name,
    )
  ) {
    return 'clinical';
  }
  if (
    /deprivation|IMD|IDACI|decile|quintile|thnic/i.test(name) ||
    /^Sexual/.test(name) ||
    /Religion|isab/.test(name)
  ) {
    return 'inequality';
  }
  return 'demographic';
}

export function classificationScheme(ct: { CategoryTypeID: number; Name: string }): string {
  const n = ct.Name;
  const id = ct.CategoryTypeID;
  if (/IMD2010/.test(n)) return 'IMD2010';
  if (/IMD2015/.test(n)) return 'IMD2015';
  if (/IMD2019/.test(n)) return 'IMD2019';
  if (/IMD2025/.test(n)) return 'IMD2025';
  if (/IDACI/.test(n)) return 'IDACI';
  if (/IMD.*trend|trend.*IMD/i.test(n)) return 'IMD-trend';
  if (id === 15) return 'binary';
  if (id === 4) return 'ONS-7cat';
  if (id === 16) return 'ONS-6cat';
  if (id === 17) return 'ONS-17cat';
  if (id === 18) return 'ONS-18cat';
  if (id === 33) return 'ONS-5cat';
  if (id === 43) return 'ONS-3cat';
  if (id === 49) return 'ONS-12cat';
  if (id === 51) return 'ONS-9cat';
  if (id === 110) return 'NHS-5cat-excl';
  if (id === 111) return 'NHS-6cat-incl';
  if (id === 129) return 'ONS-4cat';
  if (id === 140) return 'ONS-5cat-alt';
  if (id === 152) return 'ONS-19cat';
  if (id === 154) return 'ONS-16cat-incl';
  if (id === 29) return 'ONS-5cat-excl';
  if (id === 155) return 'ONS-11cat';
  if (id === 228) return 'ONS-2021-6cat';
  if (id === 27) return 'disability-2cat';
  if (id === 95) return 'disability-alt';
  if (id === 24) return 'sexuality-default';
  if (id === 58) return 'sexuality-2cat';
  if (id === 7) return 'sexuality-4cat';
  if (id === 142) return 'sexuality-3cat';
  if (id === 112) return 'religion-default';
  if (id === 19) return 'religion-8cat';
  if (id === 20) return 'religion-9cat';
  if (/decile boundar/i.test(n)) return 'decile-boundaries';
  if (/Age of mother/i.test(n)) return 'age-of-mother';
  if (/Better care/i.test(n)) return 'bcf-areas';
  if (/Birth status/i.test(n)) return 'birth-status';
  if (/Birthweight/i.test(n)) return 'birthweight';
  if (/CCG cluster|GP cluster/i.test(n)) return 'cluster-shapes';
  if (/Child body mass/i.test(n)) return 'bmi-child';
  if (/Client group/i.test(n)) return 'client-group';
  if (/Complex social/i.test(n)) return 'complex-social';
  if (/Country of birth/i.test(n)) return 'country-of-birth';
  if (/Eligibility for free|Free School/i.test(n)) return 'fsm';
  if (/Employment type/i.test(n)) return 'employment-type';
  if (/Armed Forces/i.test(n)) return 'armed-forces';
  if (/First language/i.test(n)) return 'first-language';
  if (/First or subsequent/i.test(n)) return 'parity';
  if (/Free prescriptions/i.test(n)) return 'free-prescriptions';
  if (/Gambling/i.test(n)) return 'gambling-premises';
  if (/Health status/i.test(n)) return 'health-status';
  if (/Household comp/i.test(n)) return 'household-composition';
  if (/Housing tenure/i.test(n)) return 'housing-tenure';
  if (/Level of education/i.test(n)) return 'education-level';
  if (/Limits for SII/i.test(n)) return 'sii-limits';
  if (/Marital status/i.test(n)) return 'marital-status';
  if (/Mechanism of delivery/i.test(n)) return 'delivery-mechanism';
  if (/Month born/i.test(n)) return 'month-born';
  if (/Pregnancy type/i.test(n)) return 'pregnancy-type';
  if (/Pregnant quitters/i.test(n)) return 'pregnant-quitters';
  if (/Prematurity/i.test(n)) return 'prematurity';
  if (/Primary support/i.test(n)) return 'primary-support';
  if (/Problem descriptor/i.test(n)) return 'problem-descriptor';
  if (/Reasons for economic/i.test(n)) return 'economic-inactivity';
  if (/Rurality/i.test(n)) return 'rurality';
  if (/School year/i.test(n)) return 'school-year';
  if (/SEN primary/i.test(n)) return 'sen-primary-need';
  if (/Special educational/i.test(n)) return 'sen-status';
  if (/Service user full/i.test(n)) return 'full-cost-client';
  if (/Smoking aid/i.test(n)) return 'smoking-aid';
  if (/Socioeconomic class/i.test(n)) return 'sec';
  if (/Socioeconomic group/i.test(n)) return 'seg';
  if (/Status in geographical/i.test(n)) return 'geo-hierarchy-status';
  if (/Support Setting/i.test(n)) return 'support-setting';
  if (/Survey response/i.test(n)) return 'survey-response';
  if (/Tenure/i.test(n)) return 'tenure';
  if (/Working status/i.test(n)) return 'working-status';
  if (/Long term/i.test(n)) return 'ltc';
  if (/Condition/i.test(n)) return 'condition';
  if (/Exposure/i.test(n)) return 'exposure-group';
  if (/High intensity/i.test(n)) return 'iapt-high-intensity';
  if (/HIV/i.test(n)) return 'hiv-infection';
  if (/Intervention setting/i.test(n)) return 'intervention-setting';
  if (/Intervention type/i.test(n)) return 'intervention-type';
  if (/Low intensity/i.test(n)) return 'iapt-low-intensity';
  if (/Phase type/i.test(n)) return 'phase-type';
  if (/Severe mental/i.test(n)) return 'smi';
  return n;
}

export function granularity(name: string): string | null {
  if (/decile/i.test(name)) return 'deciles';
  if (/quintile/i.test(name)) return 'quintiles';
  return null;
}

/**
 * Normalise a category-type name for duplicate detection, matching SQL Server's
 * default collation (SQL_Latin1_General_CP1_CI_AS): trailing spaces are ignored
 * and comparison is case-insensitive.
 */
export function normalizeCategoryTypeName(n: string): string {
  return n.trimEnd().toLowerCase();
}

// ─── age-mapping helpers (used by observations stage) ─────────────────────────

/**
 * Returns the dimension_value id to use for a given (AgeID, sex) pair in an observation.
 * Handles the 325→303 remap and compound-age splits. Returns null for AgeIDs to skip
 * (i.e. -1 = unknown, 1 = All ages aggregate, and 209/212/274 via separate compound logic).
 */
export function ageValueIdForObservation(ageId: number, sex: 'M' | 'F' | null): number | null {
  if (ageId === -1 || ageId === 1) return null;
  if (ageId === 325) return ageDimensionValueId(303);
  if (ageId === 209 || ageId === 212 || ageId === 274) {
    if (sex === null) return null;
    // AgeID 274 male reuses the code '209M' dimension_value (alpha quirk: the SQL does
    // WHEN 274 THEN (SELECT id FROM dimension_value WHERE code = '209M')). No 274M row exists.
    if (ageId === 274 && sex === 'M') return compoundAgeDimensionValueId(209, 'M');
    return compoundAgeDimensionValueId(ageId, sex);
  }
  return ageDimensionValueId(ageId);
}

/**
 * Maps a Pholio SexID to the dimension_value id. Returns null for SexID 4 (persons), which
 * produces no sex bridge row and drives compound-age decomposition instead, and for SexID -1
 * (not applicable), which produces no sex bridge row either.
 */
export function sexValueIdForObservation(sexId: number): number | null {
  if (sexId === -1 || sexId === 4) return null;
  return sexDimensionValueId(sexId);
}

// ─── main export ──────────────────────────────────────────────────────────────

export async function exportDimensions(context: PholioSource) {
  const { pool, outDir } = context;
  const dimensionValueIds = new Set<number>();

  await using dtWriter = new TableWriter(outDir, 'dimension_type');
  await using dvWriter = new TableWriter(outDir, 'dimension_value');

  const dimTypes: ExportRow[] = [];
  const dimValues: Array<ExportRow & { parent_id: number | null; is_aggregate: boolean }> = [];

  // ── Sex (core) ───────────────────────────────────────────────────────────────
  dimTypes.push({
    id: SEX_DIMENSION_TYPE_ID,
    name: 'Sex',
    dimension_class: 'core',
    classification_scheme: 'NHS-DD',
    granularity: null,
    scheme_version: null,
    is_required: true,
  });

  const sexValues = [
    { name: 'Male', code: '1', sort_order: 1 },
    { name: 'Female', code: '2', sort_order: 2 },
    { name: 'Not known', code: '0', sort_order: 3 },
    { name: 'Not specified', code: '9', sort_order: 4 },
  ];
  for (const v of sexValues) {
    const id = sexDimensionValueId(Number(v.code));
    dimValues.push({
      id,
      dimension_type_id: SEX_DIMENSION_TYPE_ID,
      parent_id: null,
      name: v.name,
      code: v.code,
      sort_order: v.sort_order,
      is_aggregate: false,
    });
  }

  // ── Age (core) ───────────────────────────────────────────────────────────────
  dimTypes.push({
    id: AGE_DIMENSION_TYPE_ID,
    name: 'Age',
    dimension_class: 'core',
    classification_scheme: null,
    granularity: null,
    scheme_version: null,
    is_required: true,
  });

  const ages = await queryPholio<L_Age>(
    pool,
    'SELECT AgeID, Age, Sequence, MinYears, MaxYears FROM L_Ages ORDER BY AgeID',
  );

  // Track MinYears/MaxYears by AgeID for hierarchy computation.
  const ageRangeByAgeId = new Map<number, { min: number; max: number }>();
  for (const a of ages) {
    if (a.MinYears !== null && a.MaxYears !== null && a.AgeID !== -1 && a.AgeID !== 1) {
      ageRangeByAgeId.set(a.AgeID, { min: a.MinYears, max: a.MaxYears });
    }
  }

  // Track dimension_value id by AgeID for hierarchy computation.
  const ageDvIdByAgeId = new Map<number, number>();

  for (const a of ages) {
    if (a.AgeID === -1 || a.AgeID === 325 || a.AgeID === 209 || a.AgeID === 212 || a.AgeID === 274)
      continue;
    const id = ageDimensionValueId(a.AgeID);
    ageDvIdByAgeId.set(a.AgeID, id);
    dimValues.push({
      id,
      dimension_type_id: AGE_DIMENSION_TYPE_ID,
      parent_id: null,
      name: a.Age,
      code: String(a.AgeID),
      sort_order: Math.trunc(a.Sequence),
      is_aggregate: a.AgeID === 1,
    });
  }

  // Decomposed compound age values (AgeID 209, 212, 274 → M/F splits).
  // The alpha skips inserting a value if one with the same name already exists.
  // In practice '16-64 yrs' (209M) does NOT already exist, so all five are inserted.
  // Note: AgeID 274 male reuses code '209M' as a deliberate alpha quirk.
  const compoundAgeRows = [
    { ageId: 209, sex: 'M' as const, name: '16-64 yrs', code: '209M', sort_order: 50 },
    { ageId: 209, sex: 'F' as const, name: '16-59 yrs', code: '209F', sort_order: 51 },
    { ageId: 212, sex: 'M' as const, name: '65+ yrs', code: '212M', sort_order: 52 },
    { ageId: 212, sex: 'F' as const, name: '60+ yrs', code: '212F', sort_order: 53 },
    { ageId: 274, sex: 'F' as const, name: '16-61 yrs', code: '274F', sort_order: 54 },
  ];

  // Track which names already exist among regular age values to apply the WHERE NOT EXISTS guard.
  const ageNamesSeen = new Set(ages.filter((a) => ageDvIdByAgeId.has(a.AgeID)).map((a) => a.Age));

  for (const row of compoundAgeRows) {
    if (ageNamesSeen.has(row.name)) continue;
    const id = compoundAgeDimensionValueId(row.ageId, row.sex);
    ageDvIdByAgeId.set(row.ageId * 10 + (row.sex === 'M' ? 1 : 2), id);
    dimValues.push({
      id,
      dimension_type_id: AGE_DIMENSION_TYPE_ID,
      parent_id: null,
      name: row.name,
      code: row.code,
      sort_order: row.sort_order,
      is_aggregate: false,
    });
  }

  // ── Category types → dimension_types ─────────────────────────────────────────
  const categoryTypes = await queryPholio<L_CategoryType>(
    pool,
    'SELECT CategoryTypeID, Name FROM L_CategoryTypes WHERE CategoryTypeID != -1 ORDER BY CategoryTypeID',
  );

  // Find duplicate names for the deduplication suffix, matching SQL Server collation:
  // trailing spaces and case differences are ignored (e.g. "Ethnic groups " == "Ethnic groups").
  const nameCounts = new Map<string, number>();
  for (const ct of categoryTypes) {
    const key = normalizeCategoryTypeName(ct.Name);
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }

  for (const ct of categoryTypes) {
    const name =
      (nameCounts.get(normalizeCategoryTypeName(ct.Name)) ?? 0) > 1
        ? `${ct.Name} [${ct.CategoryTypeID}]`
        : ct.Name;
    const id = categoryDimensionTypeId(ct.CategoryTypeID);

    let dimClass = dimensionClass(ct.Name);
    let scheme: string | null = classificationScheme(ct);
    const gran = granularity(ct.Name);

    // Apply fix-dimension-types.sql corrections.
    const fix = DIM_TYPE_CORRECTIONS.get(ct.CategoryTypeID);
    if (fix) {
      if (fix.dimension_class !== undefined) dimClass = fix.dimension_class;
      if (fix.classification_scheme !== undefined) scheme = fix.classification_scheme;
    }

    dimTypes.push({
      id,
      name,
      dimension_class: dimClass,
      classification_scheme: scheme,
      granularity: gran,
      scheme_version: null,
      is_required: false,
    });
  }

  // ── Category values → dimension_values ───────────────────────────────────────
  const categories = await queryPholio<L_Category>(
    pool,
    `SELECT CategoryTypeID, CategoryID, Name, Sequence
     FROM L_Categories
     WHERE CategoryTypeID != -1
     ORDER BY CategoryTypeID, CategoryID`,
  );

  for (const c of categories) {
    const dtId = categoryDimensionTypeId(c.CategoryTypeID);
    const id = categoryDimensionValueId(c.CategoryTypeID, c.CategoryID);
    dimValues.push({
      id,
      dimension_type_id: dtId,
      parent_id: null,
      name: c.Name,
      code: String(c.CategoryID),
      sort_order: c.Sequence ?? 0,
      is_aggregate: false,
    });
  }

  // ── Ethnicity broad-group parents (CT 17, 18, 152) ───────────────────────────
  for (const [ctId, groups] of ETHNICITY_BROAD_GROUPS) {
    const dtId = categoryDimensionTypeId(ctId);
    for (const g of groups) {
      const id = broadGroupDimensionValueId(ctId, g.minCat);
      dimValues.push({
        id,
        dimension_type_id: dtId,
        parent_id: null,
        name: g.name,
        code: `broad_${g.minCat}`,
        sort_order: 0,
        is_aggregate: true,
      });
    }
  }

  // ── Hierarchy: deprivation decile→quintile ────────────────────────────────────
  // For each decile dimension_type, find ONE matching quintile type by same classification_scheme
  // (same as main migration). Uses the scheme's lowest-id quintile type (TOP 1 ORDER BY id).
  const decileTypes = dimTypes.filter((dt) => dt.granularity === 'deciles');
  const quintileTypes = dimTypes.filter((dt) => dt.granularity === 'quintiles');

  // Map classification_scheme → lowest-id quintile dimension_type id.
  const quinTypeByScheme = new Map<string, number>();
  for (const qt of quintileTypes.sort((a, b) => Number(a.id) - Number(b.id))) {
    const scheme = qt.classification_scheme;
    if (typeof scheme === 'string' && !quinTypeByScheme.has(scheme)) {
      quinTypeByScheme.set(scheme, Number(qt.id));
    }
  }

  // For each decile value, set parent_id to the matching quintile value.
  // quintile_code = Math.floor((decile_code + 1) / 2)
  for (const dt of decileTypes) {
    const scheme = dt.classification_scheme;
    if (typeof scheme !== 'string') continue;
    const quinDtId = quinTypeByScheme.get(scheme);
    if (quinDtId === undefined) continue;
    for (const dv of dimValues) {
      if (Number(dv.dimension_type_id) !== Number(dt.id)) continue;
      const decileCode = Number(dv.code);
      if (!Number.isFinite(decileCode) || decileCode < 1 || decileCode > 10) continue;
      const quinCode = Math.floor((decileCode + 1) / 2);
      const parentDv = dimValues.find(
        (q) => Number(q.dimension_type_id) === quinDtId && q.code === String(quinCode),
      );
      if (parentDv) dv.parent_id = Number(parentDv.id);
    }
  }

  // fix-deprivation-orphans.sql: the IMD-trend decile types were missed by the main migration
  // because their classification_scheme was NULL before fix-dimension-types.sql ran. Link them now.
  for (const [decileCtId, quinCtId] of DEPRIVATION_ORPHAN_DECILE_TO_QUINTILE) {
    const decileDtId = categoryDimensionTypeId(decileCtId);
    const quinDtId = categoryDimensionTypeId(quinCtId);
    for (const dv of dimValues) {
      if (Number(dv.dimension_type_id) !== decileDtId) continue;
      if (dv.parent_id !== null) continue;
      const decileCode = Number(dv.code);
      if (!Number.isFinite(decileCode)) continue;
      const quinCode = Math.floor((decileCode + 1) / 2);
      const parentDv = dimValues.find(
        (q) => Number(q.dimension_type_id) === quinDtId && q.code === String(quinCode),
      );
      if (parentDv) dv.parent_id = Number(parentDv.id);
    }
  }

  // ── Hierarchy: ethnicity broad-group → children ──────────────────────────────
  for (const [ctId, groups] of ETHNICITY_BROAD_GROUPS) {
    const dtId = categoryDimensionTypeId(ctId);
    for (const g of groups) {
      const parentId = broadGroupDimensionValueId(ctId, g.minCat);
      for (const dv of dimValues) {
        if (Number(dv.dimension_type_id) !== dtId) continue;
        if (dv.is_aggregate) continue;
        const code = Number(dv.code);
        if (!Number.isFinite(code)) continue;
        if (code >= g.minCat && code <= g.maxCat && dv.parent_id === null) {
          dv.parent_id = parentId;
        }
      }
    }
  }

  // ── Hierarchy: age containment ────────────────────────────────────────────────
  // For each age band with MinYears/MaxYears, find the narrowest containing band as parent.
  // Tie-break: lowest MinYears among equally-spanning parents (reproduces the alpha's choices
  // for all 31 tie cases — prefer the band that starts earliest / overlaps from below).
  const allAgesId = ageDimensionValueId(1);

  // Build list of (dv id, min, max) for containment—excludes AgeID 1 (the root).
  const ageRangeEntries: Array<{ dvId: number; ageId: number; min: number; max: number }> = [];
  for (const [ageId, range] of ageRangeByAgeId) {
    const dvId = ageDimensionValueId(ageId);
    if (dimValues.some((value) => Number(value.id) === dvId)) {
      ageRangeEntries.push({ dvId, ageId, min: range.min, max: range.max });
    }
  }

  const ageDvMap = new Map(
    dimValues
      .filter((dv) => Number(dv.dimension_type_id) === AGE_DIMENSION_TYPE_ID)
      .map((dv) => [Number(dv.id), dv]),
  );

  for (const child of ageRangeEntries) {
    const childSpan = child.max - child.min;
    let bestParent: { dvId: number; ageId: number; span: number; min: number } | null = null;
    for (const parent of ageRangeEntries) {
      if (parent.dvId === child.dvId) continue;
      const parentSpan = parent.max - parent.min;
      if (parentSpan <= childSpan) continue;
      if (parent.min > child.min || parent.max < child.max) continue;
      if (
        bestParent === null ||
        parentSpan < bestParent.span ||
        (parentSpan === bestParent.span && parent.min < bestParent.min)
      ) {
        bestParent = { dvId: parent.dvId, ageId: parent.ageId, span: parentSpan, min: parent.min };
      }
    }
    const dv = ageDvMap.get(child.dvId);
    if (dv && bestParent) dv.parent_id = bestParent.dvId;
  }

  // Top-level age bands (in ageRangeEntries but still without a parent) get "All ages" as parent.
  for (const entry of ageRangeEntries) {
    const dv = ageDvMap.get(entry.dvId);
    if (dv && dv.parent_id === null && !dv.is_aggregate) dv.parent_id = allAgesId;
  }

  // ── Age orphan fixes (name-based + fix-age-orphans.sql) ──────────────────────
  // The fix-age-orphans.sql script repeats the name-based assignments from the main migration
  // using stable ids. We express them as name lookups (same logical result, no id dependency).

  const ageDvByName = new Map<string, (typeof dimValues)[0]>();
  const ageDvByCode = new Map<string, (typeof dimValues)[0]>();
  for (const dv of dimValues) {
    if (Number(dv.dimension_type_id) === AGE_DIMENSION_TYPE_ID) {
      ageDvByName.set(String(dv.name), dv);
      ageDvByCode.set(String(dv.code), dv);
    }
  }

  const lt1yr = ageDvByName.get('<1 yr');
  const age0 = ageDvByName.get('0 yrs');
  const age04 = ageDvByName.get('0-4 yrs');
  const lt18 = ageDvByName.get('<18 yrs');
  const age1664 = ageDvByName.get('16-64 yrs');
  const allAgesDv = dimValues.find(
    (dv) => Number(dv.dimension_type_id) === AGE_DIMENSION_TYPE_ID && dv.is_aggregate,
  );

  const setOrphanParent = (
    target: (typeof dimValues)[0] | undefined,
    parent: (typeof dimValues)[0] | undefined,
  ) => {
    if (target && parent && target.parent_id === null) target.parent_id = Number(parent.id);
  };

  for (const name of [
    '<14 days',
    '<28 days',
    '<31 days',
    '<7 days',
    '<5 weeks',
    '6-8 weeks',
    '8 mths',
    '18 mths',
    '28 days - 1 yr',
    'Newborn',
  ]) {
    setOrphanParent(ageDvByName.get(name), lt1yr);
  }

  for (const name of [
    '<37 weeks gestational age at birth',
    '>=37 weeks gestational age at birth',
  ]) {
    setOrphanParent(ageDvByName.get(name), age0);
  }

  setOrphanParent(ageDvByName.get('2-2.5 yrs'), age04);

  for (const name of [
    'Nursery school age',
    'Primary school age',
    'Secondary school age',
    'School age',
    'Dependent children',
  ]) {
    setOrphanParent(ageDvByName.get(name), lt18);
  }

  for (const code of ['209F', '274F']) {
    setOrphanParent(ageDvByCode.get(code), age1664);
  }

  for (const name of ['6 months-64 yrs', '18+ and 18-64 yrs', 'School age and 18-64 yrs']) {
    setOrphanParent(ageDvByName.get(name), allAgesDv);
  }

  // ── Write tables ──────────────────────────────────────────────────────────────
  await dtWriter.writeAll(dimTypes);
  const dimTypeFile = await dtWriter.close();

  await dvWriter.writeAll(dimValues);
  const dimValueFile = await dvWriter.close();

  // Fill dimensionValueIds for the observations stage.
  for (const dv of dimValues) dimensionValueIds.add(Number(dv.id));

  return {
    dimensionValueIds,
    tables: {
      dimension_type: dimTypeFile,
      dimension_value: dimValueFile,
    },
  };
}
