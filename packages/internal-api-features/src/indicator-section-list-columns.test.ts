import { CLASSIFICATION_IDS } from '@fphd/utils/classification-dimension';
import { describe, expect, it } from 'vitest';
import type { Ages, Benchmarking, FormatAndSources, Tagging } from './contract.ts';
import {
  agesColumns,
  benchmarkingColumns,
  formatAndSourcesColumns,
  taggingColumns,
} from './indicator-section-list-columns.ts';
import { mortality, onsAlone, TAGS, tagging } from './indicator-sections.testing.ts';
import { unansweredDraft } from './testing.ts';

describe('formatAndSourcesColumns', () => {
  const dataValue: FormatAndSources['dataValues'][number] = {
    sources: [onsAlone],
    definition: 'Admissions',
    disclosureControl: 'yes',
    disclosureControlDetail: 'Rounded to the nearest 5',
  };
  // Both branches answered, as a form without JavaScript may send them.
  const everyAnswer = (hasNumeratorDenominator: 'yes' | 'no'): FormatAndSources => ({
    hasNumeratorDenominator,
    numeratorSources: [mortality],
    numeratorDefinition: 'Deaths',
    numeratorDisclosureControl: 'yes',
    numeratorDisclosureControlDetail: 'Counts under 5 suppressed',
    denominatorSources: [onsAlone],
    denominatorDefinition: 'Population',
    denominatorDisclosureControl: 'not-applicable',
    denominatorDisclosureControlDetail: 'Typed before choosing Not applicable',
    dataValues: [dataValue],
  });

  it('reads an unanswered draft as nothing answered', () => {
    expect(formatAndSourcesColumns.fromDraft(unansweredDraft)).toEqual({
      hasNumeratorDenominator: null,
      numeratorSources: [],
      numeratorDefinition: null,
      numeratorDisclosureControl: null,
      numeratorDisclosureControlDetail: null,
      denominatorSources: [],
      denominatorDefinition: null,
      denominatorDisclosureControl: null,
      denominatorDisclosureControlDetail: null,
      dataValues: [],
    });
  });

  it('writes the numerator and denominator beside a yes, with no data values', () => {
    const values = everyAnswer('yes');

    expect(formatAndSourcesColumns.toAttributes(values)).toEqual({
      hasNumeratorDenominator: true,
      numeratorDefinition: 'Deaths',
      numeratorDisclosureControl: 'yes',
      numeratorDisclosureControlDetail: 'Counts under 5 suppressed',
      denominatorDefinition: 'Population',
      denominatorDisclosureControl: 'not-applicable',
      denominatorDisclosureControlDetail: null,
    });
    expect(formatAndSourcesColumns.toLists?.(values)).toEqual({
      numeratorSources: [mortality],
      denominatorSources: [onsAlone],
      dataValues: [],
    });
  });

  it('writes the data values beside a no, with no numerator or denominator', () => {
    const values = everyAnswer('no');

    expect(formatAndSourcesColumns.toAttributes(values)).toEqual({
      hasNumeratorDenominator: false,
      numeratorDefinition: null,
      numeratorDisclosureControl: null,
      numeratorDisclosureControlDetail: null,
      denominatorDefinition: null,
      denominatorDisclosureControl: null,
      denominatorDisclosureControlDetail: null,
    });
    expect(formatAndSourcesColumns.toLists?.(values)).toEqual({
      numeratorSources: [],
      denominatorSources: [],
      dataValues: [dataValue],
    });
  });

  it("clears a data value's disclosure control details beside Not applicable", () => {
    const values = {
      ...everyAnswer('no'),
      dataValues: [{ ...dataValue, disclosureControl: 'not-applicable' as const }],
    };

    expect(formatAndSourcesColumns.toLists?.(values).dataValues).toEqual([
      { ...dataValue, disclosureControl: 'not-applicable', disclosureControlDetail: null },
    ]);
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

describe('benchmarkingColumns', () => {
  const goal = {
    lowerComparison: 'less-than',
    lowerValue: '2,400',
    upperComparison: 'more-than-or-equal',
    upperValue: '3250.5',
    polarity: 'higher-is-better',
    detail: 'The national detection rate ambition.',
  } as const;

  const answers: Benchmarking = { hasGoalBenchmark: 'yes', goals: [goal] };

  it('writes the answer and each goal with its values as numbers', () => {
    expect(benchmarkingColumns.toAttributes(answers)).toEqual({ hasGoalBenchmark: true });
    expect(benchmarkingColumns.toLists?.(answers)).toEqual({
      goals: [
        {
          lowerComparison: 'less-than',
          lowerValue: 2400,
          upperComparison: 'more-than-or-equal',
          upperValue: 3250.5,
          polarity: 'higher-is-better',
          policyDetail: 'The national detection rate ambition.',
        },
      ],
    });
  });

  it('drops the upper comparison of a single goal value and writes a blank detail as none', () => {
    expect(
      benchmarkingColumns.toLists?.({
        hasGoalBenchmark: 'yes',
        goals: [{ ...goal, upperValue: '', detail: '' }],
      }),
    ).toEqual({
      goals: [
        {
          lowerComparison: 'less-than',
          lowerValue: 2400,
          upperComparison: null,
          upperValue: null,
          polarity: 'higher-is-better',
          policyDetail: null,
        },
      ],
    });
  });

  it('writes no goals and clears whatever the form sent beside a no', () => {
    const no: Benchmarking = { hasGoalBenchmark: 'no', goals: [goal] };

    expect(benchmarkingColumns.toAttributes(no)).toEqual({ hasGoalBenchmark: false });
    expect(benchmarkingColumns.toLists?.(no)).toEqual({ goals: [] });
  });

  it('reads the answer and the goals back as they are stored', () => {
    const goals = [
      {
        lowerComparison: 'less-than-or-equal',
        lowerValue: 2400,
        upperComparison: null,
        upperValue: null,
        polarity: 'lower-is-better',
        policyDetail: null,
      },
    ] as const;

    expect(
      benchmarkingColumns.fromDraft({
        ...unansweredDraft,
        hasGoalBenchmark: true,
        goals: [...goals],
      }),
    ).toEqual({ hasGoalBenchmark: 'yes', goals });
  });

  it.each([
    [false, 'no'],
    [null, null],
  ])('reads a stored %s as %s', (hasGoalBenchmark, answer) => {
    expect(benchmarkingColumns.fromDraft({ ...unansweredDraft, hasGoalBenchmark })).toEqual({
      hasGoalBenchmark: answer,
      goals: [],
    });
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
