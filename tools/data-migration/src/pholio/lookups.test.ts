import { describe, expect, it } from 'vitest';

import { noteCategory } from './lookups.ts';

describe('noteCategory', () => {
  it.each([
    'Extreme outlier suppressed for data presentation purposes',
    'Value suppressed as denominator age group count is too small to produce a reliable DSR',
    'Value suppressed as sample size was too small to produce a reliable estimate',
    'Value suppressed due to incompleteness of source data',
  ])('classifies the source reliability note as quality: %s', (text) => {
    expect(noteCategory(text)).toBe('quality');
  });
  it('classifies geographic notes', () => {
    expect(noteCategory('Boundary change in 2019')).toBe('geographic');
    expect(noteCategory('Area geography changed')).toBe('geographic');
    expect(noteCategory('Reconfiguration of CCG boundaries')).toBe('geographic');
    expect(noteCategory('Merged with neighbouring area')).toBe('geographic');
  });

  it('classifies disclosure notes', () => {
    expect(noteCategory('Value suppressed for disclosure control')).toBe('disclosure');
    expect(noteCategory('Small numbers suppressed')).toBe('disclosure');
  });

  it('classifies estimation notes', () => {
    expect(noteCategory('Value estimated using modelled data')).toBe('estimation');
    // 'Aggregated from lower geography' matches geographic first (contains 'geograph')
    expect(noteCategory('Aggregated from sub-national data')).toBe('estimation');
  });

  it('classifies quality notes', () => {
    expect(noteCategory('Data quality issue: treat with caution')).toBe('quality');
    expect(noteCategory('Reliability of these figures may be limited')).toBe('quality');
  });

  it('classifies methodological notes', () => {
    expect(noteCategory('Methodology change applied')).toBe('methodological');
    expect(noteCategory('Change in definition from 2020')).toBe('methodological');
    expect(noteCategory('Calculation method revised')).toBe('methodological');
  });

  it('classifies missing data notes', () => {
    expect(noteCategory('Data not available for this period')).toBe('missing');
    expect(noteCategory('No data submitted')).toBe('missing');
    expect(noteCategory('Missing data')).toBe('missing');
  });

  it('falls back to contextual', () => {
    expect(noteCategory('Contextual information about this indicator')).toBe('contextual');
    expect(noteCategory(null)).toBe('contextual');
    expect(noteCategory('')).toBe('contextual');
  });

  it('matches case-insensitively', () => {
    expect(noteCategory('BOUNDARY change')).toBe('geographic');
    expect(noteCategory('DISCLOSURE control applied')).toBe('disclosure');
  });
});
