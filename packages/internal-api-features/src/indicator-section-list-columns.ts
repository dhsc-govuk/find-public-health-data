import { CLASSIFICATION_IDS } from '@fphd/utils/classification-dimension';
import {
  type Ages,
  type AgesAnswers,
  type AgesField,
  type ProviderSources,
  type ProviderSourcesAnswers,
  type ProviderSourcesField,
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

export const agesColumns: IndicatorSectionColumns<AgesField, Ages, AgesAnswers> = {
  fromDraft: (draft) => ({
    ageType: draft.ageType,
    ageRanges: draft.ageRanges,
    specificAge: draft.specificAge,
    specificAgeUnit: draft.specificAgeUnit,
    ageDetail: draft.ageDetail,
  }),
  // The answers the chosen age type does not ask for are cleared, whatever the form sent.
  toAttributes: ({ ageType, specificAge, specificAgeUnit, ageDetail }) => {
    const specific = ageType === 'specific';

    return {
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
    subtopicIds,
    classifications,
    hasFramework,
    phofIndicatorNumber,
    hasLifeStage,
    hasRiskFactor,
  }) => ({
    topicIds,
    subtopicIds,
    indicatorTypeIds: idsIn(classifications, 'indicator_type'),
    hasFramework: yesNoAnswer(hasFramework),
    frameworkIds: idsIn(classifications, 'framework'),
    phofIndicatorNumber,
    hasLifeStage: yesNoAnswer(hasLifeStage),
    lifeStageIds: idsIn(classifications, 'life_stage'),
    hasRiskFactor: yesNoAnswer(hasRiskFactor),
    riskFactorIds: idsIn(classifications, 'risk_factor'),
  }),
  // The PHOF indicator number is kept only while the Public Health Outcomes Framework is chosen.
  toAttributes: (answers) => ({
    hasFramework: answers.hasFramework === 'yes',
    phofIndicatorNumber:
      isTagListAsked(answers, 'frameworkIds') &&
      answers.frameworkIds.includes(CLASSIFICATION_IDS.publicHealthOutcomesFramework) &&
      answers.phofIndicatorNumber !== ''
        ? answers.phofIndicatorNumber
        : null,
    hasLifeStage: answers.hasLifeStage === 'yes',
    hasRiskFactor: answers.hasRiskFactor === 'yes',
  }),
  toLists: (answers) => {
    const kept = (list: TagList) => (isTagListAsked(answers, list) ? answers[list] : []);

    return {
      topicIds: answers.topicIds,
      subtopicIds: answers.subtopicIds,
      classificationIds: {
        indicator_type: kept('indicatorTypeIds'),
        framework: kept('frameworkIds'),
        life_stage: kept('lifeStageIds'),
        risk_factor: kept('riskFactorIds'),
      },
    };
  },
};

/** Whether the list is asked: always, or beside a yes. Tags beside a "No" are dropped. */
export function isTagListAsked(answers: Tagging, list: TagList): boolean {
  const { question } = TAG_LIST_DETAILS[list];
  return question === null || answers[question] === 'yes';
}
