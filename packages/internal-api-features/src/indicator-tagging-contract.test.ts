import { describe, expect, it } from 'vitest';

import {
  taggingSection as section,
  subtopicRequiredMessage,
  subtopicsOf,
  type TaggingFormValues,
  type TagOptions,
  unknownTagMessage,
} from './indicator-tagging-contract.ts';
import { sectionFieldErrors } from './testing.ts';

const topic = '019fa38f-073f-764e-9ac6-1c4d03b10001';
const otherTopic = '019fa38f-073f-764e-9ac6-1c4d03b10002';
const type = '019fa38f-073f-764e-9ac6-1c4d03b10003';
const lifeStage = '019fa38f-073f-764e-9ac6-1c4d03b10004';
const framework = '019fa38f-073f-764e-9ac6-1c4d03b10005';
const riskFactor = '019fa38f-073f-764e-9ac6-1c4d03b10006';

const answered: TaggingFormValues = {
  topicIds: [topic, otherTopic],
  subtopicIds: [],
  indicatorTypeIds: [type],
  hasFramework: 'yes',
  frameworkIds: [framework],
  phofIndicatorNumber: ' 2.12 ',
  hasLifeStage: 'yes',
  lifeStageIds: [lifeStage],
  hasRiskFactor: 'yes',
  riskFactorIds: [riskFactor],
};

const unanswered: TaggingFormValues = {
  topicIds: [],
  subtopicIds: [],
  indicatorTypeIds: [],
  hasFramework: '',
  frameworkIds: [],
  phofIndicatorNumber: '',
  hasLifeStage: '',
  lifeStageIds: [],
  hasRiskFactor: '',
  riskFactorIds: [],
};

describe('taggingSection', () => {
  it('accepts every question answered, with the PHOF indicator number trimmed', () => {
    expect(section.schema.parse(answered)).toEqual({ ...answered, phofIndicatorNumber: '2.12' });
  });

  it('refuses multiple measure types', () => {
    expect(sectionFieldErrors(section, { ...answered, indicatorTypeIds: [type, topic] })).toEqual({
      indicatorTypeIds: 'Select only one measure type',
    });
  });

  it('takes each tag once, in the order it was added', () => {
    expect(
      section.schema.parse({ ...answered, topicIds: [otherTopic, topic, otherTopic] }).topicIds,
    ).toEqual([otherTopic, topic]);
  });

  it('refuses every unanswered question and empty list at once', () => {
    expect(sectionFieldErrors(section, unanswered)).toEqual({
      topicIds: 'Select at least one topic',
      indicatorTypeIds: 'Select a measure type',
      hasFramework: 'Select whether this indicator is part of a framework or programme',
      hasLifeStage: 'Select whether you need to include the life stage the indicator relates to',
      hasRiskFactor: 'Select whether this indicator includes a risk factor',
    });
  });

  it('asks for a tag beside each "Yes", along with the other refusals', () => {
    expect(
      sectionFieldErrors(section, {
        ...unanswered,
        hasFramework: 'yes',
        hasLifeStage: 'yes',
        hasRiskFactor: 'yes',
      }),
    ).toEqual({
      topicIds: 'Select at least one topic',
      indicatorTypeIds: 'Select a measure type',
      frameworkIds: 'Select at least one framework or programme',
      lifeStageIds: 'Select at least one life stage',
      riskFactorIds: 'Select at least one risk factor',
    });
  });

  it('refuses a tag that is not an id', () => {
    expect(sectionFieldErrors(section, { ...answered, indicatorTypeIds: ['outcome'] })).toEqual({
      indicatorTypeIds: 'Select a measure type from the list',
    });
  });

  it('refuses a PHOF indicator number longer than a single-line answer', () => {
    expect(
      sectionFieldErrors(section, { ...answered, phofIndicatorNumber: '1'.repeat(301) }),
    ).toEqual({ phofIndicatorNumber: 'PHOF indicator number must be 300 characters or fewer' });
  });

  it.each([undefined, null, 'tags'])('refuses %o, which is not a set of answers', (body) => {
    expect(section.schema.safeParse(body).success).toBe(false);
  });
});

describe('unknownTagMessage', () => {
  it('names the tag with its article', () => {
    expect(unknownTagMessage('topicIds')).toBe('Select a topic from the list');
    expect(unknownTagMessage('riskFactorIds')).toBe('Select a risk factor from the list');
  });
});

describe('subtopicRequiredMessage', () => {
  it('names the topic that needs a subtopic', () => {
    expect(subtopicRequiredMessage({ id: topic, name: 'Cancer' })).toBe(
      'Select a subtopic for Cancer',
    );
  });
});

describe('subtopicsOf', () => {
  it('lists only the subtopics under the topic', () => {
    const options: TagOptions = {
      topics: [],
      subtopics: [
        { id: lifeStage, name: 'All cancers', topicId: topic },
        { id: framework, name: 'Dementia', topicId: otherTopic },
      ],
      indicatorTypes: [],
      frameworks: [],
      lifeStages: [],
      riskFactors: [],
    };

    expect(subtopicsOf(options, topic)).toEqual([
      { id: lifeStage, name: 'All cancers', topicId: topic },
    ]);
  });
});

describe('taggingSection.formValues', () => {
  it('gives each unanswered question to the form as empty, with the tags held', () => {
    expect(
      section.formValues({
        topicIds: [topic],
        subtopicIds: [],
        indicatorTypeIds: [type],
        hasFramework: 'yes',
        frameworkIds: [framework],
        phofIndicatorNumber: null,
        hasLifeStage: null,
        lifeStageIds: [],
        hasRiskFactor: null,
        riskFactorIds: [],
      }),
    ).toEqual({
      topicIds: [topic],
      subtopicIds: [],
      indicatorTypeIds: [type],
      hasFramework: 'yes',
      frameworkIds: [framework],
      phofIndicatorNumber: '',
      hasLifeStage: '',
      lifeStageIds: [],
      hasRiskFactor: '',
      riskFactorIds: [],
    });
  });
});
