import { isYearType } from '@fphd/utils/period-type';
import { hasUpdateFrequencyReason } from '@fphd/utils/update-frequency';
import { standardisationOf, UNIT_IDS } from '@fphd/utils/value-type-and-unit';

import {
  type Benchmarking,
  type BenchmarkingField,
  type Calculation,
  type CalculationField,
  type CiMethodKind,
  type ConfidenceIntervals,
  type ConfidenceIntervalsField,
  calculationSection,
  copyrightAndDataReuseQuestions,
  copyrightAndDataReuseSection,
  type DataQualityField,
  definitionAndRationaleSection,
  goalValue,
  goalValueText,
  type IndicatorDataQuality,
  type IndicatorUpdateFrequency,
  justificationsQuestions,
  justificationsSection,
  type OtherComments,
  type OtherCommentsField,
  type OtherNotesAndCaveats,
  type OtherNotesAndCaveatsField,
  otherCommentsQuestions,
  otherCommentsSection,
  otherNotesAndCaveatsQuestions,
  otherNotesAndCaveatsSection,
  type PeriodType,
  type PeriodTypeField,
  type PublishingDate,
  type PublishingDateField,
  polaritySection,
  publishingDateValues,
  type SexGenderAndEthnicity,
  type SexGenderAndEthnicityAnswers,
  type SexGenderAndEthnicityField,
  UPDATE_FREQUENCY_REASON_FIELDS,
  type UpdateFrequencyField,
  type UpdateSummary,
  type UpdateSummaryField,
  type ValueTypeAndUnits,
  type ValueTypeAndUnitsField,
  type VarianceAndQuality,
  type VarianceAndQualityField,
} from './contract.ts';
import {
  detailOf,
  type IndicatorSectionColumns,
  type OwnFieldColumns,
  sameNamedColumns,
  yesNoAnswer,
  yesNoDetailColumns,
} from './indicator-section.ts';

export const definitionAndRationaleColumns = sameNamedColumns(definitionAndRationaleSection.fields);

export const polarityColumns = sameNamedColumns(polaritySection.fields);

// The draft keeps one reason, which the form shows under the answer it was given for. A reason
// typed under another answer is dropped, whatever the form sent.
export const updateFrequencyColumns: IndicatorSectionColumns<
  UpdateFrequencyField,
  IndicatorUpdateFrequency
> = {
  fromDraft: ({ updateFrequency, updateFrequencyReason }) => ({
    updateFrequency,
    noFixedFrequencyReason: updateFrequency === 'no-fixed-frequency' ? updateFrequencyReason : null,
    noLongerUpdatedReason: updateFrequency === 'no-longer-updated' ? updateFrequencyReason : null,
  }),
  toAttributes: (answers) => ({
    updateFrequency: answers.updateFrequency,
    updateFrequencyReason: hasUpdateFrequencyReason(answers.updateFrequency)
      ? answers[UPDATE_FREQUENCY_REASON_FIELDS[answers.updateFrequency]]
      : null,
  }),
};

export const calculationColumns: IndicatorSectionColumns<CalculationField, Calculation> = {
  ...sameNamedColumns(calculationSection.fields),
  // Details typed under "Other" are dropped once another organisation is chosen.
  toAttributes: ({ methodology, calculatedBy, calculatedByDetail }) => ({
    methodology,
    calculatedBy,
    calculatedByDetail: calculatedBy === 'other' ? calculatedByDetail : null,
  }),
};

export const valueTypeAndUnitsColumns: IndicatorSectionColumns<
  ValueTypeAndUnitsField,
  ValueTypeAndUnits
> = {
  fromDraft: (draft) => {
    const indirect =
      draft.valueTypeId !== null && standardisationOf(draft.valueTypeId) === 'indirect';

    return {
      valueTypeId: draft.valueTypeId,
      standardPopulation: draft.standardPopulation,
      standardPopulationOther: indirect ? null : draft.standardPopulationDetail,
      referencePopulation: indirect ? draft.standardPopulationDetail : null,
      unitId: draft.unitId,
      unitDetail: draft.unitDetail,
    };
  },
  // Answers the chosen value type or unit does not ask for are cleared, whatever the form sent.
  toAttributes: (answers) => {
    const standardisation = standardisationOf(answers.valueTypeId);
    const standardPopulation =
      standardisation === 'direct' && answers.standardPopulation !== ''
        ? answers.standardPopulation
        : null;

    return {
      valueTypeId: answers.valueTypeId,
      standardPopulation,
      standardPopulationDetail:
        standardPopulation === 'other'
          ? answers.standardPopulationOther
          : standardisation === 'indirect'
            ? answers.referencePopulation
            : null,
      unitId: answers.unitId,
      unitDetail: answers.unitId === UNIT_IDS.other ? answers.unitDetail : null,
    };
  },
};

export type ConfidenceIntervalsWithKind = ConfidenceIntervals & { kind: CiMethodKind };

export const confidenceIntervalsColumns: IndicatorSectionColumns<
  ConfidenceIntervalsField,
  ConfidenceIntervalsWithKind
> = {
  fromDraft: (draft) => ({
    ciMethodId: draft.ciMethodId,
    hasCiMethodModifications: yesNoAnswer(draft.hasCiMethodModifications),
    ciMethodModificationsDetail: draft.ciMethodModificationsDetail,
    ciMethodDetail: draft.ciMethodDetail,
  }),
  // Answers the chosen method does not ask for are cleared, whatever the form sent.
  toAttributes: ({
    ciMethodId,
    hasCiMethodModifications,
    ciMethodModificationsDetail,
    ciMethodDetail,
    kind,
  }) => {
    const modified = kind === 'standard' ? hasCiMethodModifications === 'yes' : null;

    return {
      ciMethodId,
      hasCiMethodModifications: modified,
      ciMethodModificationsDetail: modified ? ciMethodModificationsDetail : null,
      ciMethodDetail: kind === 'other' ? ciMethodDetail : null,
    };
  },
};

export const dataQualityColumns: IndicatorSectionColumns<DataQualityField, IndicatorDataQuality> = {
  fromDraft: (draft) => ({ hasDataQualityIssues: yesNoAnswer(draft.hasDataQualityIssues) }),
  toAttributes: ({ hasDataQualityIssues }) => ({
    hasDataQualityIssues: hasDataQualityIssues === 'yes',
  }),
};

function numberText(value: number | null): string | null {
  return value === null ? null : String(value);
}

export const periodTypeColumns: IndicatorSectionColumns<PeriodTypeField, PeriodType> = {
  fromDraft: (draft) => ({
    periodType: draft.periodType,
    yearType: draft.yearType,
    yearEndDay: numberText(draft.yearEndDay),
    yearEndMonth: numberText(draft.yearEndMonth),
  }),
  // Answers the chosen period and year types do not ask for are cleared, whatever the form sent.
  toAttributes: ({ periodType, yearType, yearEndDay, yearEndMonth }) => {
    // The schema has refused any other year type beside years or quarters.
    const kept = periodType === 'months' || !isYearType(yearType) ? null : yearType;
    const endsOnDate = kept === 'specified-end-date';

    return {
      periodType,
      yearType: kept,
      yearEndDay: endsOnDate ? Number(yearEndDay) : null,
      yearEndMonth: endsOnDate ? Number(yearEndMonth) : null,
    };
  },
};

const otherNotesAndCaveatsAnswers = yesNoDetailColumns(
  otherNotesAndCaveatsSection,
  otherNotesAndCaveatsQuestions,
);

export const otherNotesAndCaveatsColumns: IndicatorSectionColumns<
  OtherNotesAndCaveatsField,
  OtherNotesAndCaveats
> = {
  ...otherNotesAndCaveatsAnswers,
  // Disclosure control is stored as its answer, which "Not applicable" makes more than yes/no.
  toAttributes: (answers) => ({
    ...otherNotesAndCaveatsAnswers.toAttributes(answers),
    disclosureControlDetail: detailOf(answers.disclosureControl, answers.disclosureControlDetail),
  }),
};

export const varianceAndQualityColumns: OwnFieldColumns<
  VarianceAndQualityField,
  VarianceAndQuality
> = {
  fromDraft: ({ variation, qualityAssurance, sourceDataIssuesDetail }) => ({
    variation,
    qualityAssurance,
    sourceDataIssuesDetail,
  }),
  // The improvement notes are optional, and none given is stored as none.
  toAttributes: (answers) => ({
    ...answers,
    sourceDataIssuesDetail: answers.sourceDataIssuesDetail || null,
  }),
};

export const justificationsColumns = yesNoDetailColumns(
  justificationsSection,
  justificationsQuestions,
);

const otherCommentsAnswers = yesNoDetailColumns(otherCommentsSection, otherCommentsQuestions);

export const otherCommentsColumns: OwnFieldColumns<OtherCommentsField, OtherComments> = {
  ...otherCommentsAnswers,
  // The sponsors and stakeholders are optional, and none given is stored as none.
  toAttributes: (answers) => ({
    ...otherCommentsAnswers.toAttributes(answers),
    sponsorsAndStakeholders: answers.sponsorsAndStakeholders || null,
  }),
};

export const updateSummaryColumns: OwnFieldColumns<UpdateSummaryField, UpdateSummary> = {
  fromDraft: ({ updateSummary, updateSummaryForReviewers }) => ({
    updateSummary,
    updateSummaryForReviewers,
  }),
  // The information for the reviewers is optional, and none given is stored as none.
  toAttributes: (answers) => ({
    ...answers,
    updateSummaryForReviewers: answers.updateSummaryForReviewers || null,
  }),
};

export const copyrightAndDataReuseColumns = yesNoDetailColumns(
  copyrightAndDataReuseSection,
  copyrightAndDataReuseQuestions,
);

export const benchmarkingColumns: IndicatorSectionColumns<BenchmarkingField, Benchmarking> = {
  fromDraft: (draft) => ({
    hasGoalBenchmark: yesNoAnswer(draft.hasGoalBenchmark),
    goalLowerValue: goalValueText(draft.goalLowerValue),
    goalUpperValue: goalValueText(draft.goalUpperValue),
    goalPolarity: draft.goalPolarity,
    goalPolicyDetail: draft.goalPolicyDetail,
  }),
  // The goal is kept beside a yes alone, whatever the form sent, and a blank detail is none.
  toAttributes: (answers) =>
    answers.hasGoalBenchmark === 'yes'
      ? {
          hasGoalBenchmark: true,
          goalLowerValue: goalValue(answers.goalLowerValue) ?? null,
          goalUpperValue: goalValue(answers.goalUpperValue) ?? null,
          goalPolarity: answers.goalPolarity || null,
          goalPolicyDetail: answers.goalPolicyDetail || null,
        }
      : {
          hasGoalBenchmark: false,
          goalLowerValue: null,
          goalUpperValue: null,
          goalPolarity: null,
          goalPolicyDetail: null,
        },
};

export const sexGenderAndEthnicityColumns: IndicatorSectionColumns<
  SexGenderAndEthnicityField,
  SexGenderAndEthnicity,
  SexGenderAndEthnicityAnswers
> = {
  fromDraft: (draft) => ({
    demographics: draft.demographics ?? [],
    sexes: draft.sexes ?? [],
    genders: draft.genders ?? [],
    ethnicGroups: draft.ethnicGroups ?? [],
  }),
  // The lists of a demographic not collected are cleared, whatever the form sent.
  toAttributes: ({ demographics, sexes, genders, ethnicGroups }) => ({
    demographics,
    sexes: demographics.includes('sex') ? sexes : null,
    genders: demographics.includes('gender') ? genders : null,
    ethnicGroups: demographics.includes('ethnicity') ? ethnicGroups : null,
  }),
};

/** The publishing date with the instant it names. */
export type PublishingDateWithInstant = PublishingDate & { scheduledPublishAt: Date };

/** The date and time a publisher typed, from the instant they name in UK time. */
function publishingDateAnswers(
  scheduledPublishAt: Date | null,
): Record<PublishingDateField, string | null> {
  if (scheduledPublishAt === null) {
    return {
      publishingDateDay: null,
      publishingDateMonth: null,
      publishingDateYear: null,
      publishingTimeHour: null,
      publishingTimeMinute: null,
    };
  }

  return publishingDateValues(scheduledPublishAt);
}

export const publishingDateColumns: IndicatorSectionColumns<
  PublishingDateField,
  PublishingDateWithInstant
> = {
  fromDraft: (draft) => publishingDateAnswers(draft.scheduledPublishAt),
  toAttributes: ({ scheduledPublishAt }) => ({ scheduledPublishAt }),
};
