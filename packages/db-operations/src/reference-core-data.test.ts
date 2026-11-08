import { expect, it } from 'vitest';

import { parseReferenceData, readReferenceData } from './reference-core-data.ts';
import { readSeedTable } from './seed-csv.testing.ts';

it('holds complete lookup rows under unique stable ids and names', () => {
  const records = readReferenceData();
  expect(
    Object.fromEntries(Object.entries(records).map(([key, rows]) => [key, rows.length])),
  ).toEqual({
    areaTypes: 101,
    dimensionTypes: 153,
    dimensionValues: 1384,
    dimensionTypesPublic: 153,
    dimensionValuesPublic: 1366,
    deprivationSchemes: 55,
    areaLevels: 40,
    noteTypes: 235,
  });
});

it.each([
  'Extreme outlier suppressed for data presentation purposes',
  'Value suppressed as denominator age group count is too small to produce a reliable DSR',
  'Value suppressed as sample size was too small to produce a reliable estimate',
  'Value suppressed due to incompleteness of source data',
])('keeps the reliability note category consistent in core data and seed: %s', (text) => {
  expect(readReferenceData().noteTypes.find((note) => note.text === text)?.category).toBe(
    'quality',
  );
  expect(readSeedTable('note_type').find((note) => note.text === text)?.category).toBe('quality');
});

it('refuses a public name for a dimension value that does not exist', () => {
  const records = readReferenceData();
  const [first] = records.dimensionValuesPublic;

  expect(() =>
    parseReferenceData({
      ...records,
      dimensionValuesPublic: [{ ...first, id: '019de0d5-c800-7000-8000-000000000000' }],
    }),
  ).toThrow(/names no dimensionValues entry/);
});

it('refuses an area level whose area type names and ids disagree', () => {
  const records = readReferenceData();
  const [level] = records.areaLevels;

  expect(() =>
    parseReferenceData({
      ...records,
      areaLevels: [{ ...level, areaTypes: ['Not an area type'] }],
    }),
  ).toThrow(/names area types its ids don't/);
});

it('puts every area type with areas in a level, apart from those left out on purpose', () => {
  const records = readReferenceData();
  const inLevels = new Set(records.areaLevels.flatMap(({ areaTypeIds }) => areaTypeIds));
  const leftOut = records.areaTypes
    .filter(({ id }) => !inLevels.has(id))
    .map(({ name }) => name)
    .sort();

  // Each holds no areas, or areas no data uses, such as screening sites.
  expect(leftOut).toEqual([
    'AAA Screening Cohort',
    'Acute Trusts',
    'Bowel Cancer Screening Centres',
    'CCGs (2017/18)',
    'CCGs (2018/19)',
    'CCGs (2019/20)',
    'CCGs (2020/21)',
    'CCGs (from Apr 2021)',
    'CCGs (pre 4/2017)',
    'Counties & UAs (2019/20)',
    'Counties & UAs (2020/21)',
    'Counties & UAs (2021/22-2022/23)',
    'Counties & UAs (from Apr 2023)',
    'Counties & UAs (pre Apr 2019)',
    'Districts & UAs (2019/20)',
    'Districts & UAs (2020/21)',
    'Districts & UAs (2021/22-2022/23)',
    'Districts & UAs (from Apr 2023)',
    'Districts & UAs (pre Apr 2019)',
    'ICBs Slivers',
    'Mental Health Trust [119]',
    'NHS region',
    'NHS regions (pre ICB)',
    'NHS regions - new due to ICB changes',
    'NHS regions Slivers',
    'Newborn Screening Sites',
    'PHE Centres (2013)',
    'PHE Centres (2015)',
    'STPs (from Apr 2020)',
    'STPs (pre Apr 2020)',
  ]);
});

it('refuses duplicate lookup ids and names before import', () => {
  const records = readReferenceData();
  const note = records.noteTypes[0];
  if (!note) throw new Error('Missing note fixture');
  records.noteTypes.push({ ...note });
  expect(() => parseReferenceData(records)).toThrow('Duplicate noteTypes entries');
});

it('refuses a value whose type or parent is missing', () => {
  const records = readReferenceData();
  const value = records.dimensionValues[0];
  if (!value) throw new Error('Missing value fixture');
  value.dimensionTypeId = '019de000-0000-7000-8000-000000000001';
  expect(() => parseReferenceData(records)).toThrow('unknown dimension type');
  const type = records.dimensionTypes[0];
  if (!type) throw new Error('Missing dimension type fixture');
  value.dimensionTypeId = type.id;
  value.parentId = '019de000-0000-7000-8000-000000000001';
  expect(() => parseReferenceData(records)).toThrow('unknown parent');
});

it('preserves source labels so reference packages match by name', () => {
  const records = readReferenceData();
  expect(
    records.areaTypes.find(({ id }) => id === '019de0d5-c800-700c-8000-000000000054')?.name,
  ).toBe('PHE Region ');
  const areaType = records.areaTypes[0];
  if (!areaType) throw new Error('Missing area type fixture');
  areaType.name = '   ';
  expect(() => parseReferenceData(records)).toThrow('non-blank reference label');
});
