import { isYearType } from '@fphd/utils/period-type';
import { ukDateTime } from '@fphd/utils/uk-time';
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
  updateFrequencySection,
  type ValueTypeAndUnits,
  type ValueTypeAndUnitsField,
  varianceAndQualityQuestions,
  varianceAndQualitySection,
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

export const updateFrequencyColumns = sameNamedColumns(updateFrequencySection.fields);

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

export const varianceAndQualityColumns = yesNoDetailColumns(
  varianceAndQualitySection,
  varianceAndQualityQuestions,
);

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

  const { year, month, day, hour, minute } = ukDateTime(scheduledPublishAt);
  const twoDigits = (value: number) => String(value).padStart(2, '0');

  // Day and month as the hint's example gives them; hour and minute as the clock shows them.
  return {
    publishingDateDay: String(day),
    publishingDateMonth: String(month),
    publishingDateYear: String(year),
    publishingTimeHour: twoDigits(hour),
    publishingTimeMinute: twoDigits(minute),
  };
}

export const publishingDateColumns: IndicatorSectionColumns<
  PublishingDateField,
  PublishingDateWithInstant
> = {
  fromDraft: (draft) => publishingDateAnswers(draft.scheduledPublishAt),
  toAttributes: ({ scheduledPublishAt }) => ({ scheduledPublishAt }),
};
