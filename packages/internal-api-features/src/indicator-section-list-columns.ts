import { CLASSIFICATION_DIMENSIONS } from '@fphd/utils/classification-dimension';
import {
  type ProviderSources,
  type ProviderSourcesAnswers,
  type ProviderSourcesField,
  type SexAndAges,
  type SexAndAgesAnswers,
  type SexAndAgesField,
  TAG_LIST_DETAILS,
  type Tagging,
  type TaggingAnswers,
  type TaggingField,
  type TagList,
} from './contract.ts';
import { type IndicatorSectionColumns, yesNoAnswer } from './indicator-section.ts';
import type { IndicatorDraftClassification } from './indicator-version-lists-repository.ts';

export const numeratorColumns: IndicatorSectionColumns<
  ProviderSourcesField,
  ProviderSources,
  ProviderSourcesAnswers
> = {
  fromDraft: (draft) => ({
    sources: draft.numeratorSources,
    definition: draft.numeratorDefinition,
  }),
  toAttributes: ({ definition }) => ({ numeratorDefinition: definition }),
  toLists: ({ sources }) => ({ numeratorSources: sources }),
};

export const denominatorColumns: IndicatorSectionColumns<
  ProviderSourcesField,
  ProviderSources,
  ProviderSourcesAnswers
> = {
  fromDraft: (draft) => ({
    sources: draft.denominatorSources,
    definition: draft.denominatorDefinition,
  }),
  toAttributes: ({ definition }) => ({ denominatorDefinition: definition }),
  toLists: ({ sources }) => ({ denominatorSources: sources }),
};

// A limit or age the form accepted, which is a whole number or nothing.
function age(value: string): number | null {
  return value === '' ? null : Number(value);
}

export const sexAndAgesColumns: IndicatorSectionColumns<
  SexAndAgesField,
  SexAndAges,
  SexAndAgesAnswers
> = {
  fromDraft: (draft) => ({
    demographics: draft.demographics ?? [],
    sexes: draft.sexes ?? [],
    genders: draft.genders ?? [],
    ethnicGroups: draft.ethnicGroups ?? [],
    ageType: draft.ageType,
    ageRanges: draft.ageRanges,
    specificAge: draft.specificAge,
    specificAgeUnit: draft.specificAgeUnit,
    ageDetail: draft.ageDetail,
  }),
  // The lists of a demographic not collected, and the answers the chosen age type does not ask
  // for, are cleared, whatever the form sent.
  toAttributes: ({
    demographics,
    sexes,
    genders,
    ethnicGroups,
    ageType,
    specificAge,
    specificAgeUnit,
    ageDetail,
  }) => {
    const specific = ageType === 'specific';

    return {
      demographics,
      sexes: demographics.includes('sex') ? sexes : null,
      genders: demographics.includes('gender') ? genders : null,
      ethnicGroups: demographics.includes('ethnicity') ? ethnicGroups : null,
      ageType,
      specificAge: specific ? age(specificAge) : null,
      specificAgeUnit: specific && specificAgeUnit !== '' ? specificAgeUnit : null,
      ageDetail: ageType === 'other' ? ageDetail : null,
    };
  },
  toLists: ({ ageType, ageRanges }) => ({
    ageRanges:
      ageType === 'range'
        ? ageRanges.map(({ lowerLimit, lowerLimitUnit, upperLimit, upperLimitUnit }) => ({
            lowerLimit: age(lowerLimit),
            lowerLimitUnit: lowerLimitUnit === '' ? null : lowerLimitUnit,
            upperLimit: age(upperLimit),
            upperLimitUnit: upperLimitUnit === '' ? null : upperLimitUnit,
          }))
        : [],
  }),
};

function idsIn(
  classifications: readonly IndicatorDraftClassification[],
  dimension: IndicatorDraftClassification['dimension'],
): string[] {
  return classifications.filter((row) => row.dimension === dimension).map(({ id }) => id);
}

export const taggingColumns: IndicatorSectionColumns<TaggingField, Tagging, TaggingAnswers> = {
  fromDraft: ({
    topicIds,
    primaryTopicId,
    subtopicIds,
    primarySubtopicId,
    classifications,
    hasLifeStage,
    hasFramework,
    isAreaContext,
  }) => ({
    ...(isAreaContext ? { isAreaContext: 'yes' as const } : {}),
    topicIds,
    primaryTopicId,
    subtopicIds,
    primarySubtopicId,
    indicatorTypeIds: idsIn(classifications, 'indicator_type'),
    hasLifeStage: yesNoAnswer(hasLifeStage),
    lifeStageIds: idsIn(classifications, 'life_stage'),
    hasFramework: yesNoAnswer(hasFramework),
    frameworkIds: idsIn(classifications, 'framework'),
  }),
  toAttributes: ({ hasLifeStage, hasFramework, isAreaContext }) => ({
    isAreaContext: isAreaContext === 'yes',
    hasLifeStage: hasLifeStage === 'yes',
    hasFramework: hasFramework === 'yes',
  }),
  toLists: (answers) => {
    if (answers.isAreaContext === 'yes')
      return {
        topicIds: [],
        primaryTopicId: null,
        subtopicIds: [],
        primarySubtopicId: null,
        classificationIds: Object.fromEntries(
          CLASSIFICATION_DIMENSIONS.map((dimension) => [dimension, []]),
        ),
      };
    const kept = (list: TagList) => (isTagListAsked(answers, list) ? answers[list] : []);

    return {
      topicIds: answers.topicIds,
      primaryTopicId: answers.primaryTopicId,
      subtopicIds: answers.subtopicIds,
      primarySubtopicId: answers.primarySubtopicId || null,
      classificationIds: {
        indicator_type: kept('indicatorTypeIds'),
        life_stage: kept('lifeStageIds'),
        framework: kept('frameworkIds'),
      },
    };
  },
};

/** Whether the list is asked: always, or beside a yes. Tags beside a "No" are dropped. */
export function isTagListAsked(answers: Tagging, list: TagList): boolean {
  const { question } = TAG_LIST_DETAILS[list];
  return question === null || answers[question] === 'yes';
}
