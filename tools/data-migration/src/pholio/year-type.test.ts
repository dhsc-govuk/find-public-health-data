import { PERIOD_TYPES, YEAR_TYPES as UTILS_YEAR_TYPES } from '@fphd/utils/period-type';
import { describe, expect, it } from 'vitest';

import { YEAR_TYPES, yearTypeValues } from './year-type.ts';

describe('yearTypeValues', () => {
  it('has 17 entries, each with a recognised period_type and year_type', () => {
    expect(Object.keys(YEAR_TYPES)).toHaveLength(17);
    for (const name of Object.keys(YEAR_TYPES)) {
      const values = yearTypeValues(name);
      expect(PERIOD_TYPES as readonly string[]).toContain(values.period_type);
      expect(UTILS_YEAR_TYPES as readonly string[]).toContain(values.year_type);
    }
  });

  it('maps Calendar to years/calendar with no year end', () => {
    expect(yearTypeValues('Calendar')).toEqual({
      period_type: 'years',
      year_type: 'calendar',
      year_end_day: null,
      year_end_month: null,
    });
  });

  it('maps Financial to years/financial with no year end', () => {
    expect(yearTypeValues('Financial')).toEqual({
      period_type: 'years',
      year_type: 'financial',
      year_end_day: null,
      year_end_month: null,
    });
  });

  it('maps Academic to years/academic with no year end', () => {
    expect(yearTypeValues('Academic')).toEqual({
      period_type: 'years',
      year_type: 'academic',
      year_end_day: null,
      year_end_month: null,
    });
  });

  it('maps August-July to years/specified-end-date ending 31 July', () => {
    expect(yearTypeValues('August-July')).toEqual({
      period_type: 'years',
      year_type: 'specified-end-date',
      year_end_day: 31,
      year_end_month: 7,
    });
  });

  it('sets year_end_day and year_end_month only when year_type is specified-end-date', () => {
    for (const [name, entry] of Object.entries(YEAR_TYPES)) {
      const hasEnd = entry.year_end_day !== null || entry.year_end_month !== null;
      expect(hasEnd, name).toBe(entry.year_type === 'specified-end-date');
    }
  });

  it('maps Financial multi year cumulative quarters to quarters/financial', () => {
    const values = yearTypeValues('Financial multi year cumulative quarters');
    expect(values.period_type).toBe('quarters');
    expect(values.year_type).toBe('financial');
  });

  it('throws for an unrecognised year type name', () => {
    expect(() => yearTypeValues('Fortnightly')).toThrow('Fortnightly');
  });
});

describe('YEAR_TYPES values consistency', () => {
  it('uses only values the @fphd/utils/period-type module recognises', () => {
    for (const entry of Object.values(YEAR_TYPES)) {
      expect(PERIOD_TYPES as readonly string[]).toContain(entry.period_type);
      expect(UTILS_YEAR_TYPES as readonly string[]).toContain(entry.year_type);
    }
  });
});
