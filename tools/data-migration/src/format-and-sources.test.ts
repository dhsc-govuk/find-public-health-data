import { describe, expect, it } from 'vitest';

import { formatAndSources } from './format-and-sources.ts';

const deaths = { definition: 'Deaths', source: 'ONS' };
const population = { definition: 'Population', source: 'ONS population' };
const none = { definition: null, source: null };

describe('formatAndSources', () => {
  it('gives both sides as the numerator and denominator, the disclosure control on the numerator', () => {
    expect(
      formatAndSources(deaths, population, { answer: 'yes', detail: 'Counts under 5 suppressed' }),
    ).toEqual({
      hasNumeratorDenominator: true,
      numerator: {
        ...deaths,
        disclosureControl: 'yes',
        disclosureControlDetail: 'Counts under 5 suppressed',
      },
      denominator: { ...population, disclosureControl: null, disclosureControlDetail: null },
      dataValue: null,
    });
  });

  it('gives one side as the single data value, with "No" as "not-applicable"', () => {
    expect(formatAndSources(none, population, { answer: 'no', detail: null })).toEqual({
      hasNumeratorDenominator: false,
      numerator: null,
      denominator: null,
      dataValue: {
        ...population,
        disclosureControl: 'not-applicable',
        disclosureControlDetail: null,
      },
    });
  });

  it('counts a blank definition with no source as no side', () => {
    expect(
      formatAndSources(deaths, { definition: ' ', source: null }, { answer: null, detail: null }),
    ).toMatchObject({ hasNumeratorDenominator: false, dataValue: { definition: 'Deaths' } });
  });

  it('counts a blank source name with no definition as no side', () => {
    expect(
      formatAndSources(deaths, { definition: null, source: ' ' }, { answer: null, detail: null }),
    ).toMatchObject({ hasNumeratorDenominator: false, dataValue: { definition: 'Deaths' } });
  });

  it('leaves the question unanswered with neither side', () => {
    expect(formatAndSources(none, none, { answer: 'yes', detail: 'Suppressed' })).toEqual({
      hasNumeratorDenominator: null,
      numerator: null,
      denominator: null,
      dataValue: null,
    });
  });
});
