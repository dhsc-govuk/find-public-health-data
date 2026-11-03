import { describe, expect, it } from 'vitest';

import { areaTypeHierarchyType, areaTypeName, normalizeAreaTypeName } from './geography.ts';

describe('areaTypeName', () => {
  it('appends [id] suffix for duplicate names', () => {
    expect(areaTypeName('GPs', 7, true)).toBe('GPs [7]');
  });

  it('leaves unique names unchanged', () => {
    expect(areaTypeName('Regions (statistical)', 6, false)).toBe('Regions (statistical)');
  });
});

describe('areaTypeHierarchyType', () => {
  it('returns NHS for hard-coded area type ids', () => {
    expect(areaTypeHierarchyType(null, 7)).toBe('NHS');
    expect(areaTypeHierarchyType('', 66)).toBe('NHS');
    expect(areaTypeHierarchyType('Administrative', 153)).toBe('NHS');
  });

  it('returns NHS when AreaTypeClass contains NHS', () => {
    expect(areaTypeHierarchyType('NHS Region', 200)).toBe('NHS');
    expect(areaTypeHierarchyType('CCG areas', 200)).toBe('NHS');
    expect(areaTypeHierarchyType('ICB boundary', 200)).toBe('NHS');
  });

  it('returns Administrative for non-NHS class', () => {
    expect(areaTypeHierarchyType('Local authority', 200)).toBe('Administrative');
    expect(areaTypeHierarchyType(null, 200)).toBe('Administrative');
  });
});

describe('normalizeAreaTypeName', () => {
  it('strips trailing spaces to match SQL Server trailing-space-ignoring collation', () => {
    expect(normalizeAreaTypeName('GPs ')).toBe('gps');
    expect(normalizeAreaTypeName('GPs')).toBe('gps');
  });

  it('lowercases to match SQL Server case-insensitive collation', () => {
    expect(normalizeAreaTypeName('Regions')).toBe('regions');
    expect(normalizeAreaTypeName('REGIONS')).toBe('regions');
  });

  it('makes trailing-space variant collide with canonical name', () => {
    expect(normalizeAreaTypeName('Counties & UAs')).toBe(normalizeAreaTypeName('Counties & UAs '));
  });
});
