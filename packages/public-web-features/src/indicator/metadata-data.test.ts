import { describe, expect, it } from 'vitest';

import { sourceLine, updateFrequencyLine } from './metadata-data.ts';

const NO_DETAILS = {
  updateFrequencyYears: null,
  updateFrequencyText: null,
  updateFrequencyReason: null,
};

describe('updateFrequencyLine', () => {
  it('gives the label of a frequency with no details', () => {
    expect(updateFrequencyLine({ updateFrequency: 'annually', ...NO_DETAILS })).toBe('Annually');
  });

  it('gives the number of years of a frequency of more than 1 year', () => {
    expect(
      updateFrequencyLine({
        updateFrequency: 'every-n-years',
        ...NO_DETAILS,
        updateFrequencyYears: 4,
      }),
    ).toBe('Every 4 years');
  });

  it("gives the publisher's own description of an other frequency", () => {
    expect(
      updateFrequencyLine({
        updateFrequency: 'other',
        ...NO_DETAILS,
        updateFrequencyText: 'Annual measurements during the academic year.\nPublished in winter.',
      }),
    ).toBe('Annual measurements during the academic year.\nPublished in winter.');
  });

  it('introduces the reason given, on the line above it', () => {
    expect(
      updateFrequencyLine({
        updateFrequency: 'no-longer-updated',
        ...NO_DETAILS,
        updateFrequencyReason: 'The survey has ended.',
      }),
    ).toBe(
      'This indicator will no longer be updated for the following reason:\nThe survey has ended.',
    );
  });

  it('gives the label alone for an indicator imported without a reason', () => {
    expect(updateFrequencyLine({ updateFrequency: 'no-fixed-frequency', ...NO_DETAILS })).toBe(
      'No fixed frequency',
    );
  });

  it('gives nothing for an indicator imported without a frequency', () => {
    expect(updateFrequencyLine({ updateFrequency: null, ...NO_DETAILS })).toBeNull();
  });
});

describe('sourceLine', () => {
  const ons = { provider: 'Office for National Statistics (ONS)', source: 'Live births' };
  const estimated = { provider: 'Estimated', source: null };
  const dataValue = (sources: (typeof ons | typeof estimated)[]) => ({
    sources,
    definition: null,
    disclosureControl: null,
  });

  it("gives the numerator's sources", () => {
    expect(
      sourceLine({ numeratorSources: [ons, estimated], dataValues: [], dataSource: null }),
    ).toBe('Office for National Statistics (ONS): Live births; Estimated');
  });

  it("gives every data value's sources once each, for an indicator with no numerator", () => {
    expect(
      sourceLine({
        numeratorSources: [],
        dataValues: [dataValue([ons]), dataValue([estimated, ons])],
        dataSource: { name: 'Fingertips', url: null },
      }),
    ).toBe('Office for National Statistics (ONS): Live births; Estimated');
  });

  it('gives the data source where there are no sources, and nothing where there is none', () => {
    const dataSource = { name: 'Hospital Episode Statistics', url: null };

    expect(sourceLine({ numeratorSources: [], dataValues: [], dataSource })).toBe(
      'Hospital Episode Statistics',
    );
    expect(sourceLine({ numeratorSources: [], dataValues: [], dataSource: null })).toBeNull();
  });
});
