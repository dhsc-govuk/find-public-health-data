import { describe, expect, it } from 'vitest';

import {
  addProviderSource,
  areProviderSourcesOffered,
  type DataProvider,
  type FormatAndSourcesFormValues,
  formatAndSourcesSection,
  MAX_DATA_VALUES,
  MAX_PROVIDER_SOURCES,
  NO_SPECIFIC_SOURCE,
  type ProviderSource,
  providerSourceLabel,
  SOURCE_NOT_OFFERED_LABEL,
} from './indicator-format-and-sources-contract.ts';
import { sectionFieldErrors } from './testing.ts';

const providers: DataProvider[] = [
  {
    id: '01a0d858-9885-764e-8d53-6826aec67001',
    name: 'Office for National Statistics (ONS)',
    sources: [
      { id: '01a0d858-9885-764e-8d53-6826aec67002', name: 'Annual mortality extract' },
      { id: '01a0d858-9885-764e-8d53-6826aec67003', name: 'Mid-year population estimates' },
    ],
  },
  { id: '01a0d858-9885-764e-8d53-6826aec67004', name: 'Estimated', sources: [] },
];

const [ons, estimated] = providers as [DataProvider, DataProvider];
const mortality: ProviderSource = { providerId: ons.id, sourceId: ons.sources[0]?.id ?? null };
const onsAlone: ProviderSource = { providerId: ons.id, sourceId: null };

/** As many distinct sources as the list may hold. */
const fullList: ProviderSource[] = Array.from({ length: MAX_PROVIDER_SOURCES }, (_, index) => ({
  providerId: `01a0d858-9885-764e-8d53-${String(index).padStart(12, '0')}`,
  sourceId: null,
}));

const unanswered: FormatAndSourcesFormValues = {
  hasNumeratorDenominator: '',
  numeratorSources: [],
  numeratorDefinition: '',
  numeratorDisclosureControl: '',
  numeratorDisclosureControlDetail: '',
  denominatorSources: [],
  denominatorDefinition: '',
  denominatorDisclosureControl: '',
  denominatorDisclosureControlDetail: '',
  dataValues: [],
};

const withNumeratorAndDenominator: FormatAndSourcesFormValues = {
  ...unanswered,
  hasNumeratorDenominator: 'yes',
  numeratorSources: [mortality, onsAlone],
  numeratorDefinition: ' Deaths\n',
  numeratorDisclosureControl: 'yes',
  numeratorDisclosureControlDetail: 'Counts under 5 suppressed',
  denominatorSources: [onsAlone],
  denominatorDefinition: 'Population',
  denominatorDisclosureControl: 'not-applicable',
};

const dataValue = {
  sources: [onsAlone],
  definition: 'Admissions',
  disclosureControl: 'not-applicable',
  disclosureControlDetail: '',
};

const withDataValues: FormatAndSourcesFormValues = {
  ...unanswered,
  hasNumeratorDenominator: 'no',
  dataValues: [dataValue, { ...dataValue, definition: 'Discharges' }],
};

describe('formatAndSourcesSection', () => {
  it('takes a numerator and denominator, each definition without its surrounding spaces', () => {
    expect(formatAndSourcesSection.schema.parse(withNumeratorAndDenominator)).toMatchObject({
      numeratorSources: [mortality, onsAlone],
      numeratorDefinition: 'Deaths',
      numeratorDisclosureControl: 'yes',
    });
  });

  it('takes data values in the order given', () => {
    expect(formatAndSourcesSection.schema.parse(withDataValues).dataValues).toEqual([
      dataValue,
      { ...dataValue, definition: 'Discharges' },
    ]);
  });

  it('asks only whether there is a numerator and denominator until it is answered', () => {
    expect(sectionFieldErrors(formatAndSourcesSection, unanswered)).toEqual({
      hasNumeratorDenominator: 'Select whether this indicator has a numerator and denominator',
    });
  });

  it('asks for every answer about the numerator and denominator beside a yes', () => {
    expect(
      sectionFieldErrors(formatAndSourcesSection, {
        ...unanswered,
        hasNumeratorDenominator: 'yes',
      }),
    ).toEqual({
      numeratorSources: 'Add at least one data source for the numerator',
      numeratorDefinition: 'Enter the numerator definition',
      numeratorDisclosureControl:
        'Select whether disclosure control has been applied to the numerator',
      denominatorSources: 'Add at least one data source for the denominator',
      denominatorDefinition: 'Enter the denominator definition',
      denominatorDisclosureControl:
        'Select whether disclosure control has been applied to the denominator',
    });
  });

  it('asks for the details of disclosure control applied to a figure', () => {
    expect(
      sectionFieldErrors(formatAndSourcesSection, {
        ...withNumeratorAndDenominator,
        numeratorDisclosureControlDetail: ' ',
        denominatorDisclosureControl: 'yes',
      }),
    ).toEqual({
      numeratorDisclosureControlDetail:
        'Provide details of the disclosure control applied to the numerator',
      denominatorDisclosureControlDetail:
        'Provide details of the disclosure control applied to the denominator',
    });
  });

  it.each([
    [[mortality, mortality], 'Select a source that has not already been added'],
    [[...fullList, mortality], 'You cannot add more than 20 data sources'],
  ])('refuses the numerator sources %j', (numeratorSources, message) => {
    expect(
      sectionFieldErrors(formatAndSourcesSection, {
        ...withNumeratorAndDenominator,
        numeratorSources,
      }),
    ).toEqual({ numeratorSources: message });
  });

  it('refuses a disclosure control answer it does not offer', () => {
    expect(
      sectionFieldErrors(formatAndSourcesSection, {
        ...withNumeratorAndDenominator,
        denominatorDisclosureControl: 'no',
      }),
    ).toEqual({
      denominatorDisclosureControl:
        'Select whether disclosure control has been applied to the denominator',
    });
  });

  it('asks for every answer about each data value beside a no, naming the data value', () => {
    expect(
      sectionFieldErrors(formatAndSourcesSection, {
        ...withDataValues,
        dataValues: [
          dataValue,
          { sources: [], definition: '', disclosureControl: '', disclosureControlDetail: '' },
          { ...dataValue, disclosureControl: 'yes' },
        ],
      }),
    ).toEqual({
      'dataValues[1].sources': 'Add at least one data source for data value 2',
      'dataValues[1].definition': 'Enter the definition for data value 2',
      'dataValues[1].disclosureControl':
        'Select whether disclosure control has been applied to data value 2',
      'dataValues[2].disclosureControlDetail':
        'Provide details of the disclosure control applied to data value 3',
    });
  });

  it('asks for the first data value where none is sent beside a no', () => {
    expect(
      sectionFieldErrors(formatAndSourcesSection, { ...unanswered, hasNumeratorDenominator: 'no' }),
    ).toEqual({ 'dataValues[0].sources': 'Add at least one data source for data value 1' });
  });

  it(`refuses more than ${MAX_DATA_VALUES} data values`, () => {
    expect(
      sectionFieldErrors(formatAndSourcesSection, {
        ...withDataValues,
        dataValues: Array.from({ length: MAX_DATA_VALUES + 1 }, () => dataValue),
      }),
    ).toEqual({ dataValues: 'You cannot add more than 20 data values' });
  });

  it('asks nothing of the branch not chosen', () => {
    expect(
      sectionFieldErrors(formatAndSourcesSection, {
        ...withDataValues,
        numeratorDisclosureControl: 'yes',
      }),
    ).toBeUndefined();
    expect(
      sectionFieldErrors(formatAndSourcesSection, {
        ...withNumeratorAndDenominator,
        dataValues: [{ ...dataValue, definition: '' }],
      }),
    ).toBeUndefined();
  });
});

describe('formatAndSourcesSection.formValues', () => {
  it('gives each unanswered answer to the form as empty, with the sources held', () => {
    expect(
      formatAndSourcesSection.formValues({
        hasNumeratorDenominator: 'no',
        numeratorSources: [],
        numeratorDefinition: null,
        numeratorDisclosureControl: null,
        numeratorDisclosureControlDetail: null,
        denominatorSources: [],
        denominatorDefinition: null,
        denominatorDisclosureControl: null,
        denominatorDisclosureControlDetail: null,
        dataValues: [
          {
            sources: [mortality],
            definition: null,
            disclosureControl: null,
            disclosureControlDetail: null,
          },
        ],
      }),
    ).toEqual({
      ...unanswered,
      hasNumeratorDenominator: 'no',
      dataValues: [
        {
          sources: [mortality],
          definition: '',
          disclosureControl: '',
          disclosureControlDetail: '',
        },
      ],
    });
  });
});

describe('addProviderSource', () => {
  it('adds a provider with one of its sources at the end of the list', () => {
    expect(
      addProviderSource(
        'numerator',
        [onsAlone],
        { providerId: ons.id, sourceId: mortality.sourceId ?? '' },
        providers,
      ),
    ).toEqual({ sources: [onsAlone, mortality] });
  });

  it('adds a provider with no specific source', () => {
    expect(
      addProviderSource(
        'numerator',
        [],
        { providerId: estimated.id, sourceId: NO_SPECIFIC_SOURCE },
        providers,
      ),
    ).toEqual({ sources: [{ providerId: estimated.id, sourceId: null }] });
  });

  it.each([
    ['no provider', { providerId: '', sourceId: '' }, { providerId: 'Select a data provider' }],
    [
      'a provider not offered',
      { providerId: '01a0d858-9885-764e-8d53-6826aec67999', sourceId: NO_SPECIFIC_SOURCE },
      { providerId: 'Select a data provider' },
    ],
    [
      'no source',
      { providerId: ons.id, sourceId: '' },
      { sourceId: 'Select a source, or No specific source' },
    ],
    [
      "another provider's source",
      { providerId: estimated.id, sourceId: mortality.sourceId ?? '' },
      { sourceId: 'Select a source, or No specific source' },
    ],
    [
      'a source already added',
      { providerId: ons.id, sourceId: mortality.sourceId ?? '' },
      { sourceId: 'Select a source that has not already been added' },
    ],
  ])('refuses %s', (_, choice, fieldErrors) => {
    expect(addProviderSource('numerator', [mortality], choice, providers)).toEqual({ fieldErrors });
  });

  it('adds to a data value as to the numerator', () => {
    expect(
      addProviderSource(
        { dataValue: 1 },
        [],
        { providerId: estimated.id, sourceId: NO_SPECIFIC_SOURCE },
        providers,
      ),
    ).toEqual({ sources: [{ providerId: estimated.id, sourceId: null }] });
  });
});

describe('areProviderSourcesOffered', () => {
  it.each([
    [[mortality, onsAlone], true],
    [[{ providerId: estimated.id, sourceId: mortality.sourceId }], false],
    [[{ providerId: '01a0d858-9885-764e-8d53-6826aec67999', sourceId: null }], false],
  ])('judges %j as offered: %s', (sources, offered) => {
    expect(areProviderSourcesOffered(sources, providers)).toBe(offered);
  });
});

describe('providerSourceLabel', () => {
  it('names the provider and its source, or the provider alone', () => {
    expect(providerSourceLabel(mortality, providers)).toBe(
      'Office for National Statistics (ONS): Annual mortality extract',
    );
    expect(providerSourceLabel(onsAlone, providers)).toBe('Office for National Statistics (ONS)');
  });

  it('says a provider or source no longer offered is no longer available', () => {
    expect(
      providerSourceLabel(
        { providerId: '01a0d858-9885-764e-8d53-6826aec67999', sourceId: null },
        providers,
      ),
    ).toBe(SOURCE_NOT_OFFERED_LABEL);
    expect(
      providerSourceLabel({ providerId: estimated.id, sourceId: mortality.sourceId }, providers),
    ).toBe(SOURCE_NOT_OFFERED_LABEL);
  });
});
