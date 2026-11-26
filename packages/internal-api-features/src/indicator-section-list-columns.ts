import { CLASSIFICATION_IDS } from '@fphd/utils/classification-dimension';
import {
  type Ages,
  type AgesAnswers,
  type AgesField,
  type Benchmarking,
  type BenchmarkingAnswers,
  type BenchmarkingField,
  type FormatAndSources,
  type FormatAndSourcesAnswers,
  type FormatAndSourcesField,
  goalValue,
  TAG_LIST_DETAILS,
  type Tagging,
  type TaggingAnswers,
  type TaggingField,
  type TagList,
} from './contract.ts';
import { detailOf, type IndicatorSectionColumns, yesNoAnswer } from './indicator-section.ts';
import type { IndicatorDraftClassification } from './indicator-version-lists-repository.ts';

/** An answer to a question that may be unanswered, which the form sends as empty. */
function answered<Answer extends string>(answer: Answer | ''): Answer | null {
  return answer === '' ? null : answer;
}

/**
 * The answers of the branch the publisher chose are kept: the numerator and denominator beside a
 * yes, and the data values beside a no. The other branch is cleared, whatever the form sent.
 */
export const formatAndSourcesColumns: IndicatorSectionColumns<
  FormatAndSourcesField,
  FormatAndSources,
  FormatAndSourcesAnswers
> = {
  fromDraft: (draft) => ({
    hasNumeratorDenominator: yesNoAnswer(draft.hasNumeratorDenominator),
    numeratorSources: draft.numeratorSources,
    numeratorDefinition: draft.numeratorDefinition,
    numeratorDisclosureControl: draft.numeratorDisclosureControl,
    numeratorDisclosureControlDetail: draft.numeratorDisclosureControlDetail,
    denominatorSources: draft.denominatorSources,
    denominatorDefinition: draft.denominatorDefinition,
    denominatorDisclosureControl: draft.denominatorDisclosureControl,
    denominatorDisclosureControlDetail: draft.denominatorDisclosureControlDetail,
    dataValues: draft.dataValues,
  }),
  toAttributes: (answers) => {
    const kept = answers.hasNumeratorDenominator === 'yes';

    return {
      hasNumeratorDenominator: kept,
      numeratorDefinition: kept ? answers.numeratorDefinition : null,
      numeratorDisclosureControl: kept ? answered(answers.numeratorDisclosureControl) : null,
      numeratorDisclosureControlDetail: kept
        ? detailOf(answers.numeratorDisclosureControl, answers.numeratorDisclosureControlDetail)
        : null,
      denominatorDefinition: kept ? answers.denominatorDefinition : null,
      denominatorDisclosureControl: kept ? answered(answers.denominatorDisclosureControl) : null,
      denominatorDisclosureControlDetail: kept
        ? detailOf(answers.denominatorDisclosureControl, answers.denominatorDisclosureControlDetail)
        : null,
    };
  },
  toLists: (answers) => {
    const kept = answers.hasNumeratorDenominator === 'yes';

    return {
      numeratorSources: kept ? answers.numeratorSources : [],
      denominatorSources: kept ? answers.denominatorSources : [],
      dataValues: kept
        ? []
        : answers.dataValues.map((dataValue) => ({
            sources: dataValue.sources,
            definition: dataValue.definition,
            disclosureControl: answered(dataValue.disclosureControl),
            disclosureControlDetail: detailOf(
              dataValue.disclosureControl,
              dataValue.disclosureControlDetail,
            ),
          })),
    };
  },
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

/** A value the form accepted, which is a number or nothing. */
function goalNumber(text: string): number | null {
  return goalValue(text) ?? null;
}

/** A part of a goal the schema requires beside a yes, so every goal it accepts has one. */
function required<Value>(value: Value | '' | null, part: string): Value {
  if (value === '' || value === null)
    throw new Error(`a policy goal was accepted without its ${part}`);
  return value;
}

export const benchmarkingColumns: IndicatorSectionColumns<
  BenchmarkingField,
  Benchmarking,
  BenchmarkingAnswers
> = {
  fromDraft: (draft) => ({
    hasGoalBenchmark: yesNoAnswer(draft.hasGoalBenchmark),
    goals: draft.goals,
  }),
  toAttributes: ({ hasGoalBenchmark }) => ({ hasGoalBenchmark: hasGoalBenchmark === 'yes' }),
  // The goals are kept beside a yes alone, whatever the form sent. An upper comparison without an
  // upper value is dropped, and a blank detail is none.
  toLists: ({ hasGoalBenchmark, goals }) => ({
    goals:
      hasGoalBenchmark === 'yes'
        ? goals.map((goal) => {
            const upperValue = goalNumber(goal.upperValue);

            return {
              lowerComparison: required(goal.lowerComparison, 'lower comparison'),
              lowerValue: required(goalNumber(goal.lowerValue), 'lower value'),
              upperComparison:
                upperValue === null ? null : required(goal.upperComparison, 'upper comparison'),
              upperValue,
              polarity: required(goal.polarity, 'polarity'),
              policyDetail: goal.detail || null,
            };
          })
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
