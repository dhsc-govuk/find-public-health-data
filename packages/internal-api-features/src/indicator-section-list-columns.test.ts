import { CLASSIFICATION_IDS } from '@fphd/utils/classification-dimension';
import { describe, expect, it } from 'vitest';
import type { Ages, Tagging } from './contract.ts';
import type { IndicatorSectionDraft } from './indicator-section.ts';
import {
  agesColumns,
  denominatorColumns,
  numeratorColumns,
  taggingColumns,
} from './indicator-section-list-columns.ts';
import { mortality, onsAlone, TAGS, tagging } from './indicator-sections.testing.ts';
import { unansweredDraft } from './testing.ts';

const draft = {
  numeratorSources: [mortality],
  numeratorDefinition: 'Deaths',
  denominatorSources: [onsAlone],
  denominatorDefinition: 'Population',
} as unknown as IndicatorSectionDraft;

describe('numeratorColumns and denominatorColumns', () => {
  it('read each part from its own sources and definition', () => {
    expect(numeratorColumns.fromDraft(draft)).toEqual({
      sources: [mortality],
      definition: 'Deaths',
    });
    expect(denominatorColumns.fromDraft(draft)).toEqual({
      sources: [onsAlone],
      definition: 'Population',
    });
  });

  it('write the definition as a column and the sources as the list of their part', () => {
    const answers = { sources: [mortality, onsAlone], definition: 'Deaths' };

    expect(numeratorColumns.toAttributes(answers)).toEqual({ numeratorDefinition: 'Deaths' });
    expect(numeratorColumns.toLists?.(answers)).toEqual({ numeratorSources: answers.sources });
    expect(denominatorColumns.toAttributes(answers)).toEqual({ denominatorDefinition: 'Deaths' });
    expect(denominatorColumns.toLists?.(answers)).toEqual({ denominatorSources: answers.sources });
  });
});

describe('agesColumns', () => {
  // Every age type's answers filled in, as a form without JavaScript may send them.
  const everyAnswer = (ageType: Ages['ageType']): Ages => ({
    ageType,
    ageRanges: [{ lowerLimit: '16', lowerLimitUnit: 'years', upperLimit: '', upperLimitUnit: '' }],
    specificAge: '5',
    specificAgeUnit: 'weeks',
    ageDetail: 'School year 6',
  });

  it('reads unanswered ages as none', () => {
    expect(agesColumns.fromDraft(unansweredDraft)).toEqual({
      ageType: null,
      ageRanges: [],
      specificAge: null,
      specificAgeUnit: null,
      ageDetail: null,
    });
  });

  it('writes the ranges, with each limit left empty as null, and nothing else beside a range', () => {
    const values = everyAnswer('range');

    expect(agesColumns.toAttributes(values)).toEqual({
      ageType: 'range',
      specificAge: null,
      specificAgeUnit: null,
      ageDetail: null,
    });
    expect(agesColumns.toLists?.(values)).toEqual({
      ageRanges: [
        { lowerLimit: 16, lowerLimitUnit: 'years', upperLimit: null, upperLimitUnit: null },
      ],
    });
  });

  it('writes the specific age as a number, and nothing else beside it', () => {
    const values = everyAnswer('specific');

    expect(agesColumns.toAttributes(values)).toMatchObject({
      specificAge: 5,
      specificAgeUnit: 'weeks',
      ageDetail: null,
    });
    expect(agesColumns.toLists?.(values)).toEqual({ ageRanges: [] });
  });

  it('writes all ages, and nothing else beside them', () => {
    const values = everyAnswer('all');

    expect(agesColumns.toAttributes(values)).toEqual({
      ageType: 'all',
      specificAge: null,
      specificAgeUnit: null,
      ageDetail: null,
    });
    expect(agesColumns.toLists?.(values)).toEqual({ ageRanges: [] });
  });

  it('writes the other ages, and nothing else beside them', () => {
    const values = everyAnswer('other');

    expect(agesColumns.toAttributes(values)).toMatchObject({
      specificAge: null,
      specificAgeUnit: null,
      ageDetail: 'School year 6',
    });
    expect(agesColumns.toLists?.(values)).toEqual({ ageRanges: [] });
  });
});

describe('taggingColumns', () => {
  it('reads each dimension of the classifications as its own list', () => {
    expect(
      taggingColumns.fromDraft({
        ...unansweredDraft,
        hasFramework: false,
        hasLifeStage: true,
        hasRiskFactor: true,
        topicIds: [TAGS.topic],
        classifications: [
          { id: TAGS.framework, dimension: 'framework' },
          { id: TAGS.type, dimension: 'indicator_type' },
          { id: '019fa38f-073f-764e-9ac6-1c4d03b10099', dimension: 'population' },
          { id: TAGS.lifeStage, dimension: 'life_stage' },
          { id: TAGS.riskFactor, dimension: 'risk_factor' },
        ],
      }),
    ).toEqual({
      topicIds: [TAGS.topic],
      subtopicIds: [],
      indicatorTypeIds: [TAGS.type],
      hasFramework: 'no',
      frameworkIds: [TAGS.framework],
      phofIndicatorNumber: null,
      hasLifeStage: 'yes',
      lifeStageIds: [TAGS.lifeStage],
      hasRiskFactor: 'yes',
      riskFactorIds: [TAGS.riskFactor],
    });
  });

  it('writes the answers and replaces only the dimensions the page asks about', () => {
    expect(taggingColumns.toAttributes(tagging)).toEqual({
      hasFramework: false,
      phofIndicatorNumber: null,
      hasLifeStage: true,
      hasRiskFactor: false,
    });
    expect(taggingColumns.toLists?.(tagging)).toEqual({
      topicIds: [TAGS.otherTopic, TAGS.topic],
      subtopicIds: [],
      classificationIds: {
        indicator_type: [TAGS.type],
        framework: [],
        life_stage: [TAGS.lifeStage],
        risk_factor: [],
      },
    });
  });

  it('drops the tags beside a "No", whatever the form sent', () => {
    const sent: Tagging = {
      ...tagging,
      hasFramework: 'no',
      frameworkIds: [TAGS.framework],
      hasLifeStage: 'no',
      hasRiskFactor: 'no',
      riskFactorIds: [TAGS.riskFactor],
    };

    expect(taggingColumns.toLists?.(sent)).toMatchObject({
      classificationIds: { framework: [], life_stage: [], risk_factor: [] },
    });
  });

  describe('the PHOF indicator number', () => {
    const phof = CLASSIFICATION_IDS.publicHealthOutcomesFramework;
    const withPhof: Tagging = {
      ...tagging,
      hasFramework: 'yes',
      frameworkIds: [TAGS.framework, phof],
      phofIndicatorNumber: '2.12',
    };

    it('is kept beside the Public Health Outcomes Framework', () => {
      expect(taggingColumns.toAttributes(withPhof)).toMatchObject({
        phofIndicatorNumber: '2.12',
      });
    });

    it.each([
      ['without the Public Health Outcomes Framework', { frameworkIds: [TAGS.framework] }],
      ['beside a "No"', { hasFramework: 'no' as const }],
      ['when left blank', { phofIndicatorNumber: '' }],
    ])('is cleared %s', (_, change) => {
      expect(taggingColumns.toAttributes({ ...withPhof, ...change })).toMatchObject({
        phofIndicatorNumber: null,
      });
    });
  });
});
