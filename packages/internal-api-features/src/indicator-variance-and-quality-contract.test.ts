import { describe, expect, it } from 'vitest';
import { varianceAndQualitySection as section } from './indicator-variance-and-quality-contract.ts';
import { sectionFieldErrors } from './testing.ts';

const answered = {
  variation: 'Varies with the age structure of each area.',
  qualityAssurance: 'Checked against the published ONS figures.',
  sourceDataIssuesDetail: '',
};

describe('varianceAndQualitySection', () => {
  it('takes every answer without its surrounding spaces', () => {
    expect(
      section.schema.parse({
        variation: ' Varies by area.\n',
        qualityAssurance: '\tChecked. ',
        sourceDataIssuesDetail: '  Chasing late returns. ',
      }),
    ).toEqual({
      variation: 'Varies by area.',
      qualityAssurance: 'Checked.',
      sourceDataIssuesDetail: 'Chasing late returns.',
    });
  });

  it('takes the answers without the data quality improvement notes', () => {
    expect(sectionFieldErrors(section, answered)).toBeUndefined();
  });

  it('asks for every required answer when the form is empty', () => {
    expect(
      sectionFieldErrors(section, {
        variation: '',
        qualityAssurance: ' ',
        sourceDataIssuesDetail: '',
      }),
    ).toEqual({
      variation: 'Enter how the indicator varies',
      qualityAssurance: 'Enter what quality assurance has been done on the indicator',
    });
  });

  it.each([
    null,
    {},
    { variation: 'Varies by area.', qualityAssurance: 'Checked.' },
    { ...answered, sourceDataIssuesDetail: true },
    { ...answered, variation: 108 },
  ])('refuses %o, which the form never sends', (body) => {
    expect(sectionFieldErrors(section, body)).toBeDefined();
  });
});
