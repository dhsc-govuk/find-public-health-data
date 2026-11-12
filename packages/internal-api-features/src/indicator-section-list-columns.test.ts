import { describe, expect, it } from 'vitest';
import type { SexAndAges, Tagging } from './contract.ts';
import type { IndicatorSectionDraft } from './indicator-section.ts';
import {
  denominatorColumns,
  numeratorColumns,
  sexAndAgesColumns,
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

describe('sexAndAgesColumns', () => {
  // Every age type's answers filled in, as a form without JavaScript may send them.
  const everyAnswer = (ageType: SexAndAges['ageType']): SexAndAges => ({
    demographics: ['sex'],
    sexes: ['females', 'males'],
    genders: [],
    ethnicGroups: [],
    ageType,
    ageRanges: [{ lowerLimit: '16', lowerLimitUnit: 'years', upperLimit: '', upperLimitUnit: '' }],
    specificAge: '5',
    specificAgeUnit: 'weeks',
    ageDetail: 'School year 6',
  });

  it('reads unanswered demographics and their lists as none', () => {
    expect(sexAndAgesColumns.fromDraft(unansweredDraft)).toEqual({
      demographics: [],
      sexes: [],
      genders: [],
      ethnicGroups: [],
      ageType: null,
      ageRanges: [],
      specificAge: null,
      specificAgeUnit: null,
      ageDetail: null,
    });
  });

  it('writes the ranges, with each limit left empty as null, and nothing else beside a range', () => {
    const values = everyAnswer('range');

    expect(sexAndAgesColumns.toAttributes(values)).toEqual({
      demographics: ['sex'],
      sexes: ['females', 'males'],
      genders: null,
      ethnicGroups: null,
      ageType: 'range',
      specificAge: null,
      specificAgeUnit: null,
      ageDetail: null,
    });
    expect(sexAndAgesColumns.toLists?.(values)).toEqual({
      ageRanges: [
        { lowerLimit: 16, lowerLimitUnit: 'years', upperLimit: null, upperLimitUnit: null },
      ],
    });
  });

  it('writes the list of each demographic collected, and clears the others', () => {
    const values: SexAndAges = {
      ...everyAnswer('all'),
      demographics: ['gender', 'ethnicity'],
      genders: ['non-binary'],
      ethnicGroups: ['mixed', 'white'],
    };

    expect(sexAndAgesColumns.toAttributes(values)).toMatchObject({
      demographics: ['gender', 'ethnicity'],
      sexes: null,
      genders: ['non-binary'],
      ethnicGroups: ['mixed', 'white'],
    });
  });

  it('writes the specific age as a number, and nothing else beside it', () => {
    const values = everyAnswer('specific');

    expect(sexAndAgesColumns.toAttributes(values)).toMatchObject({
      specificAge: 5,
      specificAgeUnit: 'weeks',
      ageDetail: null,
    });
    expect(sexAndAgesColumns.toLists?.(values)).toEqual({ ageRanges: [] });
  });

  it('writes all ages, and nothing else beside them', () => {
    const values = everyAnswer('all');

    expect(sexAndAgesColumns.toAttributes(values)).toEqual({
      demographics: ['sex'],
      sexes: ['females', 'males'],
      genders: null,
      ethnicGroups: null,
      ageType: 'all',
      specificAge: null,
      specificAgeUnit: null,
      ageDetail: null,
    });
    expect(sexAndAgesColumns.toLists?.(values)).toEqual({ ageRanges: [] });
  });

  it('writes the other ages, and nothing else beside them', () => {
    const values = everyAnswer('other');

    expect(sexAndAgesColumns.toAttributes(values)).toMatchObject({
      specificAge: null,
      specificAgeUnit: null,
      ageDetail: 'School year 6',
    });
    expect(sexAndAgesColumns.toLists?.(values)).toEqual({ ageRanges: [] });
  });
});

describe('taggingColumns', () => {
  it('reads each dimension of the classifications as its own list', () => {
    expect(
      taggingColumns.fromDraft({
        ...unansweredDraft,
        hasLifeStage: true,
        hasFramework: false,
        topicIds: [TAGS.topic],
        classifications: [
          { id: TAGS.framework, dimension: 'framework' },
          { id: TAGS.type, dimension: 'indicator_type' },
          { id: '019fa38f-073f-764e-9ac6-1c4d03b10006', dimension: 'population' },
          { id: TAGS.lifeStage, dimension: 'life_stage' },
        ],
      }),
    ).toEqual({
      topicIds: [TAGS.topic],
      primaryTopicId: null,
      subtopicIds: [],
      primarySubtopicId: null,
      indicatorTypeIds: [TAGS.type],
      hasLifeStage: 'yes',
      lifeStageIds: [TAGS.lifeStage],
      hasFramework: 'no',
      frameworkIds: [TAGS.framework],
    });
  });

  it('writes the answers and replaces only the dimensions the page asks about', () => {
    expect(taggingColumns.toAttributes(tagging)).toEqual({
      isAreaContext: false,
      hasLifeStage: true,
      hasFramework: false,
    });
    expect(taggingColumns.toLists?.(tagging)).toEqual({
      topicIds: [TAGS.otherTopic, TAGS.topic],
      primaryTopicId: TAGS.otherTopic,
      subtopicIds: [],
      primarySubtopicId: null,
      classificationIds: {
        indicator_type: [TAGS.type],
        life_stage: [TAGS.lifeStage],
        framework: [],
      },
    });
  });

  it('drops the tags beside a "No", whatever the form sent', () => {
    const sent: Tagging = {
      ...tagging,
      hasLifeStage: 'no',
      hasFramework: 'no',
      frameworkIds: [TAGS.framework],
    };

    expect(taggingColumns.toLists?.(sent)).toMatchObject({
      classificationIds: { life_stage: [], framework: [] },
    });
  });
});
