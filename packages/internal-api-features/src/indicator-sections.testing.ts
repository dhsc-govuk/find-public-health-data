import type { CiMethodRow } from './ci-method-repository.ts';
import type { DataProvider, Tagging, TagOptions } from './contract.ts';

export const METHODS: Record<CiMethodRow['kind'], CiMethodRow> = {
  standard: {
    id: '019fa38f-073f-764e-9ac6-1c4d03b1cb92',
    name: "Byar's method",
    description: 'A standard description.',
    kind: 'standard',
  },
  other: {
    id: '019fa38f-0746-7e1c-8826-0ee5d2b83fef',
    name: 'Other method',
    description: null,
    kind: 'other',
  },
  none: {
    id: '019fa38f-0747-73bb-b8a4-bb6e8f3c244e',
    name: 'Unknown',
    description: null,
    kind: 'none',
  },
};

// Every follow-up filled in, as a form without JavaScript may send them.
export const everyAnswer = {
  hasCiMethodModifications: 'yes',
  ciMethodModificationsDetail: 'Adjusted for clustering',
  ciMethodDetail: 'Bootstrap intervals',
} as const;

export const TAGS = {
  topic: '019fa38f-073f-764e-9ac6-1c4d03b10001',
  otherTopic: '019fa38f-073f-764e-9ac6-1c4d03b10002',
  type: '019fa38f-073f-764e-9ac6-1c4d03b10003',
  lifeStage: '019fa38f-073f-764e-9ac6-1c4d03b10004',
  framework: '019fa38f-073f-764e-9ac6-1c4d03b10005',
};

export const tagOptions: TagOptions = {
  topics: [
    { id: TAGS.topic, name: 'Alcohol' },
    { id: TAGS.otherTopic, name: 'Cancer' },
  ],
  subtopics: [],
  indicatorTypes: [{ id: TAGS.type, name: 'Outcome' }],
  lifeStages: [{ id: TAGS.lifeStage, name: 'Alcohol' }],
  frameworks: [{ id: TAGS.framework, name: 'Healthy Child' }],
};

export const tagging: Tagging = {
  topicIds: [TAGS.otherTopic, TAGS.topic],
  primaryTopicId: TAGS.otherTopic,
  subtopicIds: [],
  primarySubtopicId: '',
  indicatorTypeIds: [TAGS.type],
  hasLifeStage: 'yes',
  lifeStageIds: [TAGS.lifeStage],
  hasFramework: 'no',
  frameworkIds: [],
};

export const publishingDate = {
  publishingDateDay: '14',
  publishingDateMonth: '9',
  publishingDateYear: '2027',
  publishingTimeHour: '09',
  publishingTimeMinute: '30',
};

export const ons: DataProvider = {
  id: '01a0d858-9885-764e-8d53-6826aec67001',
  name: 'Office for National Statistics (ONS)',
  sources: [{ id: '01a0d858-9885-764e-8d53-6826aec67002', name: 'Annual mortality extract' }],
};
export const mortality = { providerId: ons.id, sourceId: ons.sources[0]?.id ?? null };
export const onsAlone = { providerId: ons.id, sourceId: null };
