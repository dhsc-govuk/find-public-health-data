import { describe, expect, it } from 'vitest';

import {
  type ConfidenceIntervals,
  confidenceIntervalsSectionFor,
  confidenceIntervalsSection as section,
} from './indicator-confidence-intervals-contract.ts';
import { sectionFieldErrors } from './testing.ts';

const methodId = '019fa38f-073f-764e-9ac6-1c4d03b1cb92';

const unanswered: ConfidenceIntervals = {
  ciMethodId: methodId,
  hasCiMethodModifications: '',
  ciMethodModificationsDetail: '',
  ciMethodDetail: '',
};

describe('confidenceIntervalsSection', () => {
  it('takes every answer without its surrounding spaces, leaving the follow-ups to the method', () => {
    expect(
      section.schema.parse({
        ciMethodId: methodId,
        hasCiMethodModifications: 'yes',
        ciMethodModificationsDetail: '  Adjusted for clustering  ',
        ciMethodDetail: '  Bootstrap intervals\n',
      }),
    ).toEqual({
      ciMethodId: methodId,
      hasCiMethodModifications: 'yes',
      ciMethodModificationsDetail: 'Adjusted for clustering',
      ciMethodDetail: 'Bootstrap intervals',
    });
  });

  it('asks for a method when none is chosen', () => {
    expect(sectionFieldErrors(section, { ...unanswered, ciMethodId: '' })).toEqual({
      ciMethodId: 'Select the confidence interval method used',
    });
  });

  it.each([
    {},
    { ...unanswered, ciMethodId: 'byars' },
    { ...unanswered, hasCiMethodModifications: 'maybe' },
    { ...unanswered, ciMethodDetail: 108 },
  ])('refuses %o, which the form never sends', (body) => {
    expect(sectionFieldErrors(section, body)).toBeDefined();
  });
});

describe('confidenceIntervalsSectionFor', () => {
  it.each([
    [
      'no method, as before one is chosen',
      null,
      {},
      { ciMethodId: 'Select the confidence interval method used' },
    ],
    [
      'a standard method with no answer on modifications',
      'standard',
      {},
      {
        hasCiMethodModifications:
          'Select whether any modifications to the described method were used',
      },
    ],
    ['an unmodified standard method', 'standard', { hasCiMethodModifications: 'no' }, undefined],
    [
      'a modified standard method with no description of the modifications',
      'standard',
      { hasCiMethodModifications: 'yes' },
      { ciMethodModificationsDetail: 'Enter a description of the modifications used' },
    ],
    [
      'a modified standard method described',
      'standard',
      { hasCiMethodModifications: 'yes', ciMethodModificationsDetail: 'Adjusted' },
      undefined,
    ],
    [
      'an other method with no detail',
      'other',
      {},
      {
        ciMethodDetail: 'Enter details of the other confidence interval method',
      },
    ],
    ['an other method detailed', 'other', { ciMethodDetail: 'Bootstrap' }, undefined],
    ['a method with nothing to describe', 'none', {}, undefined],
  ] as const)('asks of %s', (_, kind, answers, missing) => {
    expect(
      sectionFieldErrors(confidenceIntervalsSectionFor(kind), { ...unanswered, ...answers }),
    ).toEqual(missing);
  });
});
