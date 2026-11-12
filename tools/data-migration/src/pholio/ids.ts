import { createHash } from 'node:crypto';

// Every id is derived from Pholio's own keys, so exporting the same Pholio twice gives the same
// ids, and a row keeps its id across the baseline and every increment. Each encoding stays below
// 2^53, exact in a JavaScript number, and well inside deterministicUuid's range.

export const SEX_DIMENSION_TYPE_ID = 1;
export const AGE_DIMENSION_TYPE_ID = 2;

const CATEGORY_TYPE_BASE = 1_000;
const SEX_VALUE_BASE = 1_000_000;
const AGE_VALUE_BASE = 2_000_000;
const COMPOUND_AGE_VALUE_BASE = 3_000_000;
const CATEGORY_VALUE_BASE = 10_000_000_000;
const BROAD_GROUP_VALUE_BASE = 20_000_000_000;
const PER_CATEGORY_TYPE = 1_000_000;

function checkedKey(name: string, value: number, limit: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value >= limit) {
    throw new Error(`${name} ${value} is outside the range its id encoding allows`);
  }
  return value;
}

function hashed(text: string): number {
  // 48 bits of a SHA-256: stable across runs and platforms. Callers check for collisions.
  return Number(BigInt(`0x${createHash('sha256').update(text).digest('hex').slice(0, 12)}`)) + 1;
}

export function categoryDimensionTypeId(categoryTypeId: number): number {
  return CATEGORY_TYPE_BASE + checkedKey('CategoryTypeID', categoryTypeId, 1_000_000);
}

export function sexDimensionValueId(sexCode: number): number {
  return SEX_VALUE_BASE + checkedKey('Sex code', sexCode, 1_000);
}

export function ageDimensionValueId(ageId: number): number {
  return AGE_VALUE_BASE + checkedKey('AgeID', ageId, 1_000_000);
}

// Pholio's compound sex-and-age bands (AgeID 209, 212, 274) are split into one value per sex.
export function compoundAgeDimensionValueId(ageId: number, sex: 'M' | 'F'): number {
  return COMPOUND_AGE_VALUE_BASE + checkedKey('AgeID', ageId, 100_000) * 10 + (sex === 'M' ? 1 : 2);
}

export function categoryDimensionValueId(categoryTypeId: number, categoryId: number): number {
  return (
    CATEGORY_VALUE_BASE +
    checkedKey('CategoryTypeID', categoryTypeId, 1_000) * PER_CATEGORY_TYPE +
    checkedKey('CategoryID', categoryId, PER_CATEGORY_TYPE)
  );
}

// The synthetic ethnicity "broad group" parents, keyed by the first category they group.
export function broadGroupDimensionValueId(
  categoryTypeId: number,
  firstCategoryId: number,
): number {
  return (
    BROAD_GROUP_VALUE_BASE +
    checkedKey('CategoryTypeID', categoryTypeId, 1_000) * PER_CATEGORY_TYPE +
    checkedKey('CategoryID', firstCategoryId, PER_CATEGORY_TYPE)
  );
}

export function areaId(code: string): number {
  return hashed(`area:${code}`);
}

export function areaRelationshipId(parentCode: string, childCode: string): number {
  return hashed(`area_relationship:${parentCode}\u0000${childCode}`);
}

export function uploadBatchId(indicatorId: number): number {
  return indicatorId;
}

// One CoreDataSet row becomes one observation, or two when a compound sex-and-age row is split
// into its male (0) and female (1) halves.
export function observationId(uid: number, split: 0 | 1 = 0): number {
  return checkedKey('CoreDataSet uid', uid, 2 ** 50) * 2 + split;
}

export function sourceUidForObservationId(id: number): number {
  return Math.floor(checkedKey('Observation id', id, 2 ** 51) / 2);
}
