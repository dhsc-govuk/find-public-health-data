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
    noteTypes: 236,
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
