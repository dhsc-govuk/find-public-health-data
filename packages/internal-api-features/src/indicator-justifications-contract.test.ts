import { describe, expect, it } from 'vitest';

import { justificationsSection as section } from './indicator-justifications-contract.ts';
import { sectionFieldErrors } from './testing.ts';

const answered = {
  ciMethodJustification: 'The standard method for rates.',
  dataSourcesJustification: 'The only national source.',
  inequalitiesIncluded: 'Deprivation deciles.',
  hasExclusions: 'no',
  exclusionsDetail: '',
  hasAutomation: 'no',
  automationDetail: '',
  noAutomationReason: 'No tool reads this source.',
};

describe('justificationsSection', () => {
  it('takes every answer without its surrounding spaces', () => {
    expect(
      section.schema.parse({
        ciMethodJustification: ' Standard. ',
        dataSourcesJustification: '\tNational.\n',
        inequalitiesIncluded: ' Deciles.',
        hasExclusions: 'yes',
        exclusionsDetail: ' Small areas. ',
        hasAutomation: 'yes',
        automationDetail: 'Pipeline. ',
        noAutomationReason: ' ',
      }),
    ).toEqual({
      ciMethodJustification: 'Standard.',
      dataSourcesJustification: 'National.',
      inequalitiesIncluded: 'Deciles.',
      hasExclusions: 'yes',
      exclusionsDetail: 'Small areas.',
      hasAutomation: 'yes',
      automationDetail: 'Pipeline.',
      noAutomationReason: '',
    });
  });

  it('takes a no to exclusions without details, and a no to automation with its reasons', () => {
    expect(sectionFieldErrors(section, answered)).toBeUndefined();
  });

  it('asks for every answer when the form is empty', () => {
    expect(
      sectionFieldErrors(section, {
        ciMethodJustification: '',
        dataSourcesJustification: ' ',
        inequalitiesIncluded: '',
        hasExclusions: '',
        exclusionsDetail: '',
        hasAutomation: '',
        automationDetail: '',
        noAutomationReason: '',
      }),
    ).toEqual({
      ciMethodJustification: 'Enter why the confidence interval method was chosen',
      dataSourcesJustification: 'Enter why the data sources were chosen',
      inequalitiesIncluded: 'Enter what health inequalities have been included',
      hasExclusions: 'Select whether there have been any exclusions',
      hasAutomation: 'Select whether internal automation tools have been used',
    });
  });

  it('asks for the details of each yes, blank ones included', () => {
    expect(
      sectionFieldErrors(section, {
        ...answered,
        hasExclusions: 'yes',
        exclusionsDetail: ' \n',
        hasAutomation: 'yes',
      }),
    ).toEqual({
      exclusionsDetail: 'Enter why exclusions were made',
      automationDetail: 'Enter details of the tools used',
    });
  });

  it('asks for the reasons no automation tools were used, blank ones included', () => {
    expect(sectionFieldErrors(section, { ...answered, noAutomationReason: ' \n' })).toEqual({
      noAutomationReason: 'Enter reasons why not',
    });
  });

  it.each([
    null,
    {},
    { ...answered, hasExclusions: 'not-applicable' },
    { ...answered, hasAutomation: false },
    { ...answered, inequalitiesIncluded: 108 },
  ])('refuses %o, which the form never sends', (body) => {
    expect(sectionFieldErrors(section, body)).toBeDefined();
  });
});
