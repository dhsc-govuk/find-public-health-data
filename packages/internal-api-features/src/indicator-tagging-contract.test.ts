import { describe, expect, it } from 'vitest';

import { ANSWER_NOT_READ } from './indicator-section-contract.ts';
import {
  taggingSection as section,
  type TaggingFormValues,
  unknownTagMessage,
} from './indicator-tagging-contract.ts';
import { sectionFieldErrors } from './testing.ts';

const topic = '019fa38f-073f-764e-9ac6-1c4d03b10001';
const otherTopic = '019fa38f-073f-764e-9ac6-1c4d03b10002';
const type = '019fa38f-073f-764e-9ac6-1c4d03b10003';
const lifeStage = '019fa38f-073f-764e-9ac6-1c4d03b10004';
const framework = '019fa38f-073f-764e-9ac6-1c4d03b10005';

const answered: TaggingFormValues = {
  topicIds: [topic, otherTopic],
  primaryTopicId: topic,
  subtopicIds: [],
  primarySubtopicId: '',
  indicatorTypeIds: [type],
  hasLifeStage: 'yes',
  lifeStageIds: [lifeStage],
  hasFramework: 'yes',
  frameworkIds: [framework],
};

const unanswered: TaggingFormValues = {
  topicIds: [],
  primaryTopicId: '',
  subtopicIds: [],
  primarySubtopicId: '',
  indicatorTypeIds: [],
  hasLifeStage: '',
  lifeStageIds: [],
  hasFramework: '',
  frameworkIds: [],
};

describe('taggingSection', () => {
  it('accepts area context without topic or tag assignments and clears stale selections', () => {
    expect(section.schema.parse({ ...answered, isAreaContext: 'yes' })).toEqual({
      isAreaContext: 'yes',
      topicIds: [],
      primaryTopicId: '',
      subtopicIds: [],
      primarySubtopicId: '',
      indicatorTypeIds: [],
      hasLifeStage: 'no',
      lifeStageIds: [],
      hasFramework: 'no',
      frameworkIds: [],
    });
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
      primaryTopicId: 'Select a primary topic',
      indicatorTypeIds: 'Select a measure type',
      hasLifeStage: 'Select whether this indicator needs a life stage tag',
      hasFramework: 'Select whether this indicator is part of a framework or programme',
    });
  });

  it('asks for a tag beside each "Yes", along with the other refusals', () => {
    expect(
      sectionFieldErrors(section, {
        ...unanswered,
        hasLifeStage: 'yes',
        hasFramework: 'yes',
      }),
    ).toEqual({
      topicIds: 'Select at least one topic',
      primaryTopicId: 'Select a primary topic',
      indicatorTypeIds: 'Select a measure type',
      lifeStageIds: 'Select at least one life stage',
      frameworkIds: 'Select at least one framework or programme',
    });
  });

  it('refuses a tag that is not an id', () => {
    expect(sectionFieldErrors(section, { ...answered, indicatorTypeIds: ['outcome'] })).toEqual({
      indicatorTypeIds: 'Select a measure type from the list',
    });
  });

  it.each(['no', true])('refuses %o as the area context answer with a written message', (sent) => {
    expect(sectionFieldErrors(section, { ...answered, isAreaContext: sent })).toEqual({
      isAreaContext: ANSWER_NOT_READ,
    });
  });

  it.each([undefined, null, 'tags'])('refuses %o, which is not a set of answers', (body) => {
    expect(section.schema.safeParse(body).success).toBe(false);
  });
});

describe('unknownTagMessage', () => {
  it('names the tag with its article', () => {
    expect(unknownTagMessage('topicIds')).toBe('Select a topic from the list');
    expect(unknownTagMessage('indicatorTypeIds')).toBe('Select a measure type from the list');
  });
});

describe('taggingSection.formValues', () => {
  it('gives each unanswered question to the form as empty, with the tags held', () => {
    expect(
      section.formValues({
        topicIds: [topic],
        primaryTopicId: topic,
        subtopicIds: [],
        primarySubtopicId: '',
        indicatorTypeIds: [type],
        hasLifeStage: null,
        lifeStageIds: [],
        hasFramework: 'yes',
        frameworkIds: [framework],
      }),
    ).toEqual({
      topicIds: [topic],
      primaryTopicId: topic,
      subtopicIds: [],
      primarySubtopicId: '',
      indicatorTypeIds: [type],
      hasLifeStage: '',
      lifeStageIds: [],
      hasFramework: 'yes',
      frameworkIds: [framework],
    });
  });
});
