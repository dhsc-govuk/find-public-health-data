import { describe, expect, it } from 'vitest';

import { completeTaskListDraft, ons } from './indicator-task-list.testing.ts';
import type { IndicatorTaskAnswers } from './indicator-task-list.ts';
import { referencedIds, updateChanges } from './indicator-update-changes.ts';

const published: IndicatorTaskAnswers = { ...completeTaskListDraft, updateSummary: null };
const names = new Map([
  [ons.providerId, 'Office for National Statistics'],
  ['019fa38f-073f-764e-9ac6-1c4d03b10001', 'Mortality'],
  ['019fa38f-073f-764e-9ac6-1c4d03b10004', 'Smoking'],
]);

function changesTo(submitted: Partial<IndicatorTaskAnswers>, replacedValues = 0) {
  return updateChanges({
    published,
    submitted: { ...published, updateSummary: 'Revised.', ...submitted },
    names,
    replacedValues,
  });
}

describe('updateChanges', () => {
  it('lists only the update summary when no task differs', () => {
    expect(changesTo({})).toEqual([
      {
        task: 'update-summary',
        parts: [{ kind: 'value', field: 'updateSummary', value: 'Revised.' }],
      },
    ]);
  });

  it('gives free text before and after, for the words added and removed', () => {
    const [change] = changesTo({ rationale: 'A summary measure of health.' });

    expect(change).toEqual({
      task: 'definition-and-rationale',
      parts: [
        {
          kind: 'text',
          field: 'rationale',
          before: published.rationale,
          after: 'A summary measure of health.',
        },
      ],
    });
  });

  it('includes the description of an other frequency when it is given or cleared', () => {
    const updateFrequencyText = 'Academic year, published in winter.';
    const [added] = changesTo({ updateFrequency: 'other', updateFrequencyText });
    expect(added).toEqual({
      task: 'update-frequency',
      parts: [
        { kind: 'value', field: 'updateFrequency', value: 'Other' },
        { kind: 'text', field: 'updateFrequencyText', before: '', after: updateFrequencyText },
      ],
    });

    const [cleared] = updateChanges({
      published: { ...published, updateFrequency: 'other', updateFrequencyText },
      submitted: published,
      names,
      replacedValues: 0,
    });
    expect(cleared).toEqual({
      task: 'update-frequency',
      parts: [
        { kind: 'value', field: 'updateFrequency', value: 'Quarterly' },
        { kind: 'text', field: 'updateFrequencyText', before: updateFrequencyText, after: '' },
      ],
    });
  });

  it('gives the number of years between updates as it was entered', () => {
    const [change] = updateChanges({
      published: { ...published, updateFrequency: 'every-n-years', updateFrequencyYears: 2 },
      submitted: {
        ...published,
        updateFrequency: 'every-n-years',
        updateFrequencyYears: 3,
        updateSummary: 'Revised.',
      },
      names,
      replacedValues: 0,
    });
    expect(change).toEqual({
      task: 'update-frequency',
      parts: [{ kind: 'value', field: 'updateFrequencyYears', value: '3' }],
    });
  });

  it('gives the name as free text', () => {
    const [change] = changesTo({ name: 'Life expectancy at 65' });

    expect(change).toEqual({
      task: 'name',
      parts: [
        {
          kind: 'text',
          field: 'name',
          before: 'Life expectancy at birth',
          after: 'Life expectancy at 65',
        },
      ],
    });
  });

  it('gives a choice as its new value in the words its page offers', () => {
    const [change] = changesTo({ polarity: 'higher-is-better' });

    expect(change).toEqual({
      task: 'polarity',
      parts: [{ kind: 'value', field: 'polarity', value: 'Higher is better' }],
    });
  });

  it('gives a choice taken away as no value', () => {
    const [change] = changesTo({ hasExclusions: null });

    expect(change?.parts).toEqual([{ kind: 'value', field: 'hasExclusions', value: null }]);
  });

  it('names what a list refers to from the core data', () => {
    const smoking = '019fa38f-073f-764e-9ac6-1c4d03b10004';
    const [change] = changesTo({ topicIds: [...published.topicIds, smoking] });

    expect(change).toEqual({
      task: 'tagging',
      parts: [{ kind: 'value', field: 'topicIds', value: 'Mortality, Smoking' }],
    });
  });

  it('names each provider of data, with its source where it names one', () => {
    const births = { providerId: ons.providerId, sourceId: '019fa38f-073f-764e-9ac6-1c4d03b10005' };
    const [change] = updateChanges({
      published,
      submitted: { ...published, numeratorSources: [births, ons] },
      names: new Map([...names, [births.sourceId, 'Live births']]),
      replacedValues: 0,
    });

    expect(change).toEqual({
      task: 'format-and-sources',
      parts: [
        {
          kind: 'value',
          field: 'numeratorSources',
          value: 'Office for National Statistics: Live births, Office for National Statistics',
        },
      ],
    });
  });

  it('gives each data value with its sources, definition and disclosure control', () => {
    const [change] = updateChanges({
      published,
      submitted: {
        ...published,
        hasNumeratorDenominator: false,
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
            sources: [ons],
            definition: 'Admissions',
            disclosureControl: 'yes',
            disclosureControlDetail: 'Rounded to 5',
          },
          {
            sources: [ons],
            definition: 'Population',
            disclosureControl: 'not-applicable',
            disclosureControlDetail: null,
          },
        ],
      },
      names,
      replacedValues: 0,
    });

    expect(change?.parts).toContainEqual({
      kind: 'value',
      field: 'dataValues',
      value:
        'Data value 1. Office for National Statistics. Admissions. Yes. Rounded to 5\n' +
        'Data value 2. Office for National Statistics. Population. Not applicable',
    });
  });

  it('counts the data values of a data table of its own as replacing the live ones', () => {
    const [change] = changesTo({ uploadBatchId: '019fa38f-073f-764e-9ac6-1c4d03b1cb94' }, 2094);

    expect(change).toEqual({
      task: 'data-table',
      parts: [{ kind: 'data_values_replaced', count: 2094 }],
    });
  });

  it('gives the age ranges in words', () => {
    const [change] = changesTo({
      ageRanges: [
        { lowerLimit: 16, lowerLimitUnit: 'years', upperLimit: 64, upperLimitUnit: 'years' },
        { lowerLimit: null, lowerLimitUnit: null, upperLimit: 5, upperLimitUnit: 'years' },
      ],
    });

    expect(change?.parts).toEqual([
      { kind: 'value', field: 'ageRanges', value: '16 years to 64 years, Up to 5 years' },
    ]);
  });

  it('gives each policy goal as its bands, with its detail where it has one', () => {
    const [change] = changesTo({
      goals: [
        {
          lowerComparison: 'less-than',
          lowerValue: 2400,
          upperComparison: 'more-than-or-equal',
          upperValue: 3250.5,
          polarity: 'higher-is-better',
          policyDetail: 'The national ambition.',
        },
        {
          lowerComparison: 'less-than-or-equal',
          lowerValue: 5,
          upperComparison: null,
          upperValue: null,
          policyDetail: null,
          polarity: 'lower-is-better',
        },
      ],
    });

    expect(change?.task).toBe('benchmarking');
    expect(change?.parts).toContainEqual({
      kind: 'value',
      field: 'goals',
      value: '≥3250.5 is good, <2400 is bad (The national ambition.); ≤5 is good',
    });
  });

  it('ends with the summary for the public history and the information for reviewers', () => {
    const changes = changesTo({
      polarity: 'higher-is-better',
      updateSummaryForReviewers: 'Checked with the data owner.',
    });

    expect(changes.map(({ task }) => task)).toEqual(['polarity', 'update-summary']);
    expect(changes.at(-1)?.parts).toEqual([
      { kind: 'value', field: 'updateSummary', value: 'Revised.' },
      { kind: 'value', field: 'updateSummaryForReviewers', value: 'Checked with the data owner.' },
    ]);
  });
});

describe('referencedIds', () => {
  it('lists the core data the answers refer to, leaving out what they leave unanswered', () => {
    expect(referencedIds(published)).toEqual([
      published.ciMethodId,
      published.valueTypeId,
      ons.providerId,
      ons.providerId,
      ...published.topicIds,
      ...published.classifications.map(({ id }) => id),
    ]);
  });
});

it('shows a changed publication start date to reviewers', () => {
  expect(changesTo({ publishedFrom: '2020-01-01' })[0]).toEqual({
    task: 'period-type',
    parts: [{ kind: 'value', field: 'publishedFrom', value: '2020-01-01' }],
  });
});
