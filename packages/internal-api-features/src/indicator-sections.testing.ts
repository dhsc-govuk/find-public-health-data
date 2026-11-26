import type { CiMethodRow } from './ci-method-repository.ts';
import type { DataProvider, FormatAndSourcesFormValues, Tagging, TagOptions } from './contract.ts';

export const METHODS: Record<CiMethodRow['kind'], CiMethodRow> = {
  standard: {
    id: '019fa38f-073f-764e-9ac6-1c4d03b1cb92',
    name: "Byar's method",
    kind: 'standard',
  },
  other: {
    id: '019fa38f-0746-7e1c-8826-0ee5d2b83fef',
    name: 'Other method',
    kind: 'other',
  },
  none: {
    id: '019fa38f-0748-74b5-83b2-f5dfebffaf22',
    name: 'No confidence intervals available',
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
  riskFactor: '019fa38f-073f-764e-9ac6-1c4d03b10006',
};

export const tagOptions: TagOptions = {
  topics: [
    { id: TAGS.topic, name: 'Alcohol' },
    { id: TAGS.otherTopic, name: 'Cancer' },
  ],
  subtopics: [],
  indicatorTypes: [{ id: TAGS.type, name: 'Outcome' }],
  frameworks: [{ id: TAGS.framework, name: 'Healthy Child' }],
  lifeStages: [{ id: TAGS.lifeStage, name: 'Alcohol' }],
  riskFactors: [{ id: TAGS.riskFactor, name: 'Alcohol' }],
};

export const tagging: Tagging = {
  topicIds: [TAGS.otherTopic, TAGS.topic],
  subtopicIds: [],
  indicatorTypeIds: [TAGS.type],
  hasFramework: 'no',
  frameworkIds: [],
  phofIndicatorNumber: '',
  hasLifeStage: 'yes',
  lifeStageIds: [TAGS.lifeStage],
  hasRiskFactor: 'no',
  riskFactorIds: [],
};

export const publishingDate = {
  publishingDateDay: '14',
  publishingDateMonth: '9',
  publishingDateYear: '2027',
  fastTracked: '' as const,
  fastTrackReason: '',
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

/** A numerator and denominator, each answered in full, as the form sends them. */
export const formatAndSources: FormatAndSourcesFormValues = {
  hasNumeratorDenominator: 'yes',
  numeratorSources: [mortality],
  numeratorDefinition: 'Deaths',
  numeratorDisclosureControl: 'not-applicable',
  numeratorDisclosureControlDetail: '',
  denominatorSources: [onsAlone],
  denominatorDefinition: 'Population',
  denominatorDisclosureControl: 'not-applicable',
  denominatorDisclosureControlDetail: '',
  dataValues: [],
};
