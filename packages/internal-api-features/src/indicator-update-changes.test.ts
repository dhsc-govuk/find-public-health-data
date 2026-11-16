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
      task: 'numerator',
      parts: [
        {
          kind: 'value',
          field: 'sources',
          value: 'Office for National Statistics: Live births, Office for National Statistics',
        },
      ],
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
    expect(referencedIds({ ...published, unitId: null })).toEqual([
      published.ciMethodId,
      published.valueTypeId,
      ons.providerId,
      ons.providerId,
      ...published.topicIds,
      ...published.classifications.map(({ id }) => id),
    ]);
  });
});
