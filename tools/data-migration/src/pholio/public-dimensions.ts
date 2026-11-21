/**
 * How the public API names each dimension type and value: which standard dimension a type
 * belongs to, its scheme or custom-dimension slug, each value's slug, each age band's range and
 * each deprivation value's group. Derived from the exported reference data, with hand-written
 * tables where a name can't be parsed, so the core reference export regenerates it whole.
 */

import type { AgeUnit, StandardDimension } from '@fphd/utils/standard-dimension';

export interface DimensionTypeInput {
  id: string;
  name: string;
  granularity: string | null;
}

export interface DimensionValueInput {
  id: string;
  dimensionTypeId: string;
  name: string;
  code: string | null;
  sortOrder: number;
  isAggregate: boolean;
}

export interface PublicDimensionType {
  id: string;
  /** Null for a custom dimension. */
  standardDimension: StandardDimension | null;
  /** A scheme's slug for a standard dimension with schemes, or a custom dimension's slug. */
  slug: string | null;
}

export interface PublicDimensionValue {
  id: string;
  slug: string;
  ageFromValue: number | null;
  ageFromUnit: AgeUnit | null;
  ageUnderValue: number | null;
  ageUnderUnit: AgeUnit | null;
  deprivationGroup: number | null;
}

export interface DeprivationScheme {
  id: string;
  release: string;
  ranked: string;
  within: 'england' | 'area';
  boundaries: string | null;
  groups: 5 | 10;
}

export interface PublicDimensions {
  types: PublicDimensionType[];
  values: PublicDimensionValue[];
  deprivationSchemes: DeprivationScheme[];
}

/** Lower-case letters, digits and hyphens, as every public value is. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replaceAll('&', ' and ')
    .replace(/^<\s*/, 'u')
    .replace(/^>=\s*/, 'ge-')
    .replaceAll('+', '-plus')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** A type's name without the `[id]` the export adds to tell duplicate names apart. */
function baseName(name: string): string {
  return name.replace(/\s*\[\d+\]$/, '').trim();
}

// Hand-named schemes and custom dimensions, keyed by the exported type name. Ethnicity and the
// smaller standard dimensions have too little in their names to build a slug from, and these
// custom dimensions share a name with another.
const NAMED_SLUGS: ReadonlyMap<string, string> = new Map([
  [
    'LSOA11 deprivation quintiles within area - bottom- middle 3 - top (IMD2010)',
    'imd2010-bottom-middle-top',
  ],
  ['Ethnic groups [4]', 'broad-7'],
  ['Ethnic groups [15]', 'white-and-ethnic-minority'],
  ['Ethnic groups [16]', 'black-and-south-asian-6'],
  ['Ethnic groups [17]', 'nhs-2001-17'],
  ['Ethnic groups [18]', 'census-2011-18'],
  ['Ethnic groups (w/o unknown)', 'broad-6'],
  ['Ethnic groups [33]', 'census-2011-5'],
  ['Ethnic groups [43]', 'black-split-7'],
  ['Ethnic groups [49]', 'south-asian-split-6'],
  ['Ethnic groups [51]', 'white-split-7'],
  ['Ethnic groups [110]', 'bame-and-white'],
  ['Ethnic groups [111]', 'broad-8'],
  ['Ethnic groups [129]', 'white-split-6'],
  ['Ethnic groups [140]', 'broad-3'],
  ['Ethnic groups [152]', 'census-2021-19'],
  ['Ethnic groups (w unknown)', 'census-2011-5-with-unknown'],
  ['Ethnic groups [155]', 'detailed-9'],
  ['Ethnic groups [228]', 'broad-4'],
  ['Religion - 8 categories', 'religion-8'],
  ['Religion - 9 categories', 'religion-9'],
  ['Religion', 'religion-13'],
  ['Sexuality', 'gss-5'],
  ['Sexuality - 2 categories', 'heterosexual-or-not-3'],
  ['Sexuality - 4 categories', 'behaviour-and-sex-4'],
  ['Sexuality 3grps + unknown', 'lgb-4'],
  ['Socioeconomic class [32]', 'nssec-4'],
  ['Socioeconomic group (18-64 yrs)', 'nssec-4-aged-18-64'],
  ['Socioeconomic class [125]', 'nssec-8'],
  ['Socioeconomic group', 'nssec-and-activity-10'],
  ['Tenure [23]', 'tenure-4'],
  ['Tenure [165]', 'tenure-3'],
  ['Working status [25]', 'working-status-3'],
  ['Working status [53]', 'working-status-6'],
  ['Working status [143]', 'working-status-8'],
  ['Rurality [26]', 'rurality-3'],
  ['Rurality [141]', 'rurality-2'],
  ['Disability [27]', 'disability'],
  ['Disability [95]', 'disability-type'],
  ['Country of birth [30]', 'uk-born'],
  ['Country of birth [52]', 'country-of-birth'],
  ['Age of mother [130]', 'age-of-mother-8'],
  ['Age of mother [151]', 'age-of-mother-6'],
  ['SEN primary need (DfE) [166]', 'sen-primary-need-15'],
  ['SEN primary need (DfE) [246]', 'sen-primary-need-16'],
]);

function standardDimensionOf(type: DimensionTypeInput): StandardDimension | null {
  const name = type.name;
  if (name === 'Sex') return 'sex';
  if (name === 'Age') return 'age';
  if (/^Ethnic groups/.test(name)) return 'ethnicity';
  if (/^Religion/.test(name)) return 'religion';
  if (/^Sexuality/.test(name)) return 'sexuality';
  if (/^Socioeconomic (class|group)/.test(name)) return 'socioeconomic-group';
  if (deprivationSchemeOf(type) !== undefined) return 'deprivation';
  return null;
}

const RANKED: ReadonlyMap<string, string> = new Map([
  ['LSOA01', 'lsoa01'],
  ['LSOA11', 'lsoa11'],
  ['LSOA21', 'lsoa21'],
  ['County & UA', 'county-ua'],
  ['District & UA', 'district-ua'],
  ['CCG', 'ccg'],
  ['General Practice', 'gp'],
]);

const DEPRIVATION_NAME =
  /^(LSOA01|LSOA11|LSOA21|County & UA|District & UA|CCG|General Practice) deprivation (deciles|quintiles|decile|quintile)( in England| within areas?)? \(([^,)]+)(?:, ?([^)]+))?\)$/;

function boundariesOf(geography: string | undefined): string | null {
  if (geography === undefined) return null;
  const pre = /^pre (\d+)\/(\d+) geog/.exec(geography);
  if (pre) return `pre-20${pre[2]}`;
  const years = [...geography.matchAll(/\d+\/(\d+)/g)].map((match) => `20${match[1]}`);
  if (years.length > 0) return years.join('-');
  const ccgs = /^(\d{4}) CCGs$/.exec(geography);
  if (ccgs) return ccgs[1] ?? null;
  throw new Error(`Unrecognised deprivation geography "${geography}"`);
}

/** A deprivation scheme's parts, parsed from its type name, or undefined if it isn't one. */
export function deprivationSchemeOf(
  type: DimensionTypeInput,
): Omit<DeprivationScheme, 'id'> | undefined {
  const match = DEPRIVATION_NAME.exec(type.name.replace(/\s+/g, ' ').trim());
  if (!match) return undefined;
  const [, rankedName, groupWord, where, release, geography] = match;
  return {
    release: (release ?? '').replace(/\s+/g, ' '),
    ranked: RANKED.get(rankedName ?? '') ?? '',
    within: where?.includes('within') ? 'area' : 'england',
    boundaries: boundariesOf(geography),
    groups: groupWord?.startsWith('decile') ? 10 : 5,
  };
}

function deprivationSlug(scheme: Omit<DeprivationScheme, 'id'>): string {
  const small = scheme.ranked.startsWith('lsoa');
  return [
    slugify(scheme.release),
    scheme.ranked,
    ...(small ? [scheme.within === 'area' ? 'within-area' : 'england'] : []),
    ...(scheme.boundaries === null ? [] : [scheme.boundaries]),
  ].join('-');
}

const DECILE_WORDS: ReadonlyMap<string, number> = new Map([
  ['most', 1],
  ['second most', 2],
  ['third more', 3],
  ['fourth more', 4],
  ['fifth more', 5],
  ['fifth less', 6],
  // One Fingertips scheme spells it "Fith".
  ['fith less', 6],
  ['fourth less', 7],
  ['third less', 8],
  ['second least', 9],
  ['least', 10],
]);

const QUINTILE_WORDS: ReadonlyMap<string, number> = new Map([
  ['most', 1],
  ['second most', 2],
  ['average', 3],
  ['second least', 4],
  ['least', 5],
]);

/** A deprivation value's group, 1 being the most deprived, from its name. */
export function deprivationGroupOf(name: string, groups: 5 | 10): number {
  const words = /^(.*?) deprived/i.exec(name)?.[1]?.toLowerCase();
  const group = (groups === 10 ? DECILE_WORDS : QUINTILE_WORDS).get(words ?? '');
  if (group === undefined) throw new Error(`Unrecognised deprivation value "${name}"`);
  return group;
}

interface AgeRange {
  from: readonly [number, AgeUnit];
  under: readonly [number, AgeUnit] | null;
}

// Fingertips' bands under a year or not in whole years, keyed by AgeID, and those that aren't
// ranges at all (null). The rest come from MinYears and MaxYears.
const AGE_RANGES: ReadonlyMap<string, AgeRange | null> = new Map([
  ['24', { from: [0, 'day'], under: [7, 'day'] }],
  ['284', { from: [0, 'day'], under: [14, 'day'] }],
  ['301', { from: [0, 'day'], under: [31, 'day'] }],
  ['203', { from: [0, 'week'], under: [5, 'week'] }],
  ['336', { from: [30, 'day'], under: [31, 'day'] }],
  ['337', { from: [56, 'day'], under: [57, 'day'] }],
  ['338', { from: [457, 'day'], under: [458, 'day'] }],
  ['339', { from: [914, 'day'], under: [915, 'day'] }],
  ['23', { from: [0, 'day'], under: [28, 'day'] }],
  ['170', { from: [6, 'week'], under: [9, 'week'] }],
  ['326', { from: [8, 'month'], under: [9, 'month'] }],
  ['327', { from: [18, 'month'], under: [19, 'month'] }],
  ['295', { from: [28, 'day'], under: [1, 'year'] }],
  ['226', { from: [6, 'month'], under: [65, 'year'] }],
  // The health visitor review, done by the time a child turns 2½.
  ['241', { from: [2, 'year'], under: [30, 'month'] }],
  ['209M', { from: [16, 'year'], under: [65, 'year'] }],
  ['209F', { from: [16, 'year'], under: [60, 'year'] }],
  ['212M', { from: [65, 'year'], under: null }],
  ['212F', { from: [60, 'year'], under: null }],
  ['274F', { from: [16, 'year'], under: [62, 'year'] }],
  // Not age ranges: the indicator's population (Newborn, gestational age, the NCMP band, school
  // stages), so the plan maps them to "not broken down".
  ['309', null],
  ['235', null],
  ['329', null],
  ['334', null],
  ['215', null],
  ['216', null],
  ['217', null],
]);

/** Fingertips writes 150 for a band with no upper limit. */
const NO_UPPER_LIMIT = 150;

function ageRangeOf(
  code: string,
  yearsByCode: ReadonlyMap<string, { min: number; max: number }>,
): AgeRange | null {
  if (AGE_RANGES.has(code)) return AGE_RANGES.get(code) ?? null;
  const years = yearsByCode.get(code);
  if (years === undefined) return null;
  return {
    from: [years.min, 'year'],
    under: years.max >= NO_UPPER_LIMIT ? null : [years.max + 1, 'year'],
  };
}

// Age slugs that slugify can't make readable.
const AGE_SLUGS: ReadonlyMap<string, string> = new Map([
  ['241', '2-to-2-and-a-half'],
  ['295', '28-days-to-1'],
  ['226', '6-months-to-64'],
]);

function ageSlug(name: string, code: string): string {
  return (
    AGE_SLUGS.get(code) ??
    slugify(
      name
        .replace(/\s*yrs?$/i, '')
        .replace(/\bmths\b/i, 'months')
        .replace(/\byrs?\b/gi, 'years'),
    )
  );
}

function sexSlug(code: string | null): string | undefined {
  return code === '1' ? 'm' : code === '2' ? 'f' : undefined;
}

/**
 * The public names of every dimension type and value. A value with no public name, such as the
 * aggregate All ages, a sex value no data uses, or a broad group the migration invented, is left
 * out, so the API never shows it.
 */
export function publicDimensions(
  types: readonly DimensionTypeInput[],
  values: readonly DimensionValueInput[],
  ageYearsByCode: ReadonlyMap<string, { min: number; max: number }>,
): PublicDimensions {
  const result: PublicDimensions = { types: [], values: [], deprivationSchemes: [] };
  const typeById = new Map<string, { type: DimensionTypeInput; public: PublicDimensionType }>();

  for (const type of types) {
    const standardDimension = standardDimensionOf(type);
    const deprivation = standardDimension === 'deprivation' ? deprivationSchemeOf(type) : undefined;
    const slug =
      standardDimension === 'sex' || standardDimension === 'age'
        ? null
        : (NAMED_SLUGS.get(type.name) ??
          (deprivation ? deprivationSlug(deprivation) : slugify(baseName(type.name))));
    const publicType = { id: type.id, standardDimension, slug };
    result.types.push(publicType);
    typeById.set(type.id, { type, public: publicType });
    if (deprivation) result.deprivationSchemes.push({ id: type.id, ...deprivation });
  }

  const schemeById = new Map(result.deprivationSchemes.map((scheme) => [scheme.id, scheme]));
  const valueNames = new Map<string, string>();
  const push = (value: PublicDimensionValue, input: DimensionValueInput, typeName: string) => {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(value.slug)) {
      throw new Error(`"${input.name}" in "${typeName}" has an invalid slug "${value.slug}"`);
    }
    const key = `${input.dimensionTypeId}:${value.slug}`;
    const other = valueNames.get(key);
    if (other !== undefined) {
      throw new Error(
        `"${input.name}" and "${other}" in "${typeName}" share the slug ${value.slug}`,
      );
    }
    valueNames.set(key, input.name);
    result.values.push(value);
  };

  for (const value of values) {
    const owner = typeById.get(value.dimensionTypeId);
    if (!owner) throw new Error(`Dimension value ${value.id} names an unknown type`);
    if (value.isAggregate) continue;

    const base = {
      id: value.id,
      ageFromValue: null,
      ageFromUnit: null,
      ageUnderValue: null,
      ageUnderUnit: null,
      deprivationGroup: null,
    };

    switch (owner.public.standardDimension) {
      case 'sex': {
        const slug = sexSlug(value.code);
        if (slug !== undefined) push({ ...base, slug }, value, owner.type.name);
        break;
      }
      case 'age': {
        const code = value.code ?? '';
        const range = ageRangeOf(code, ageYearsByCode);
        push(
          {
            ...base,
            slug: ageSlug(value.name, code),
            ageFromValue: range?.from[0] ?? null,
            ageFromUnit: range?.from[1] ?? null,
            ageUnderValue: range?.under?.[0] ?? null,
            ageUnderUnit: range?.under?.[1] ?? null,
          },
          value,
          owner.type.name,
        );
        break;
      }
      case 'deprivation': {
        const scheme = schemeById.get(owner.type.id);
        if (!scheme) throw new Error(`Deprivation type ${owner.type.name} has no scheme`);
        const group = deprivationGroupOf(value.name, scheme.groups);
        push({ ...base, slug: String(group), deprivationGroup: group }, value, owner.type.name);
        break;
      }
      default:
        push({ ...base, slug: slugify(value.name) }, value, owner.type.name);
    }
  }

  checkTypeSlugs(result, typeById);
  return result;
}

function checkTypeSlugs(
  result: PublicDimensions,
  typeById: ReadonlyMap<string, { type: DimensionTypeInput; public: PublicDimensionType }>,
): void {
  const groupsById = new Map(result.deprivationSchemes.map((scheme) => [scheme.id, scheme.groups]));
  const names = new Map<string, string>();
  for (const type of result.types) {
    if (type.slug === null) continue;
    const name = typeById.get(type.id)?.type.name ?? type.id;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(type.slug)) {
      throw new Error(`"${name}" has an invalid slug "${type.slug}"`);
    }
    // A decile and a quintile version of one ranking share their scheme's slug.
    const key = `${type.standardDimension ?? 'custom'}:${type.slug}:${groupsById.get(type.id) ?? ''}`;
    const other = names.get(key);
    if (other !== undefined)
      throw new Error(`"${name}" and "${other}" share the slug ${type.slug}`);
    names.set(key, name);
  }
}
