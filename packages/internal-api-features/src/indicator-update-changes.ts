import { isDeepStrictEqual } from 'node:util';

import { INDICATOR_CALCULATED_BY_LABELS } from '@fphd/utils/calculated-by';
import { INDICATOR_DISCLOSURE_CONTROL_LABELS } from '@fphd/utils/disclosure-control';
import { monthName, PERIOD_TYPE_LABELS, YEAR_TYPE_LABELS } from '@fphd/utils/period-type';
import { GOAL_POLARITY_LABELS, POLARITY_LABELS } from '@fphd/utils/polarity';
import {
  DEMOGRAPHIC_LABELS,
  ETHNIC_GROUP_LABELS,
  GENDER_LABELS,
  SEX_LABELS,
} from '@fphd/utils/sex-gender-and-ethnicity';
import { UPDATE_FREQUENCY_LABELS } from '@fphd/utils/update-frequency';
import { STANDARD_POPULATION_LABELS } from '@fphd/utils/value-type-and-unit';

import {
  type AgeRangeFormValues,
  agesSection,
  benchmarkingSection,
  calculationSection,
  confidenceIntervalsSection,
  copyrightAndDataReuseSection,
  dataQualitySection,
  definitionAndRationaleSection,
  denominatorSection,
  type IndicatorSection,
  type IndicatorTaskKey,
  justificationsSection,
  numeratorSection,
  otherCommentsSection,
  otherNotesAndCaveatsSection,
  type ProviderSource,
  periodTypeSection,
  polaritySection,
  sexGenderAndEthnicitySection,
  taggingSection,
  type UpdateChange,
  type UpdateChangePart,
  updateFrequencySection,
  valueTypeAndUnitsSection,
  varianceAndQualitySection,
} from './contract.ts';
import type { IndicatorSectionColumns } from './indicator-section.ts';
import {
  benchmarkingColumns,
  calculationColumns,
  confidenceIntervalsColumns,
  copyrightAndDataReuseColumns,
  dataQualityColumns,
  definitionAndRationaleColumns,
  justificationsColumns,
  otherCommentsColumns,
  otherNotesAndCaveatsColumns,
  periodTypeColumns,
  polarityColumns,
  sexGenderAndEthnicityColumns,
  updateFrequencyColumns,
  valueTypeAndUnitsColumns,
  varianceAndQualityColumns,
} from './indicator-section-columns.ts';
import {
  agesColumns,
  denominatorColumns,
  numeratorColumns,
  taggingColumns,
} from './indicator-section-list-columns.ts';
import { changedTasks, type IndicatorTaskAnswers } from './indicator-task-list.ts';

/** The names of the core data an answer refers to by id, such as a CI method or a topic, by id. */
export type ReferenceNames = ReadonlyMap<string, string>;

/**
 * How the History tab shows a changed answer: free text as the words added and removed, or any
 * other answer as its new value in words, from the answer as its form holds it.
 */
type FieldDisplay = 'text' | ((value: unknown, names: ReferenceNames) => string | null);

/** A section an update can change, with how each of its fields is shown. */
interface ChangedSection {
  formValues(version: IndicatorTaskAnswers): Record<string, unknown>;
  fields: Readonly<Record<string, FieldDisplay>>;
}

function sectionOf<Field extends string, Input, Answers>(
  section: IndicatorSection<Field, unknown, Input, string, Answers>,
  columns: IndicatorSectionColumns<Field, never, Answers>,
  fields: Readonly<Record<Field, FieldDisplay>>,
): ChangedSection {
  return {
    formValues: (version) =>
      section.formValues(columns.fromDraft(version)) as Record<string, unknown>,
    fields,
  };
}

function isAnswered(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

/** A choice, in the words its page offers it in. */
function option(labels: Readonly<Record<string, string>>): FieldDisplay {
  return (value) => (isAnswered(value) ? (labels[value] ?? value) : null);
}

/** Every choice of a list, in the words its page offers them in, or null for none. */
function options(labels: Readonly<Record<string, string>>): FieldDisplay {
  return (value) =>
    Array.isArray(value) && value.length > 0
      ? value.map((each: string) => labels[each] ?? each).join(', ')
      : null;
}

const yesNo = option({ yes: 'Yes', no: 'No' });

/** A value given in full, such as a number, as it was entered. */
const entered: FieldDisplay = (value) => (isAnswered(value) ? value : null);

/** A choice from the core data, by its name. */
const named: FieldDisplay = (value, names) =>
  isAnswered(value) ? (names.get(value) ?? value) : null;

/** Choices from the core data, by their names. */
const namedList: FieldDisplay = (value, names) =>
  Array.isArray(value) && value.length > 0
    ? value.map((id: string) => names.get(id) ?? id).join(', ')
    : null;

/** Providers of data, each with its source where it names one, as the public page shows them. */
const providerSources: FieldDisplay = (value, names) => {
  const sources = value as ProviderSource[];
  if (sources.length === 0) return null;
  return sources
    .map(({ providerId, sourceId }) => {
      const provider = names.get(providerId) ?? providerId;
      return sourceId === null ? provider : `${provider}: ${names.get(sourceId) ?? sourceId}`;
    })
    .join(', ');
};

function ageLimit(limit: string, unit: string): string {
  return `${limit} ${unit}`.trim();
}

/** Each age range, from its lower limit to its upper one, either of which may be open. */
const ageRanges: FieldDisplay = (value) => {
  const ranges = value as AgeRangeFormValues[];
  if (ranges.length === 0) return null;
  return ranges
    .map(({ lowerLimit, lowerLimitUnit, upperLimit, upperLimitUnit }) => {
      const lower = ageLimit(lowerLimit, lowerLimitUnit);
      const upper = ageLimit(upperLimit, upperLimitUnit);
      if (upper === '') return `${lower} and over`;
      if (lower === '') return `Up to ${upper}`;
      return `${lower} to ${upper}`;
    })
    .join(', ');
};

const AGE_TYPE_LABELS = {
  all: 'All ages',
  range: 'Age range',
  specific: 'Specific age',
  other: 'Other',
};

/** Each task an update can change through a section page, and how its answers are shown. */
const CHANGED_SECTIONS: Readonly<
  Record<
    Exclude<IndicatorTaskKey, 'name' | 'data-table' | 'publishing-date' | 'update-summary'>,
    ChangedSection
  >
> = {
  'definition-and-rationale': sectionOf(
    definitionAndRationaleSection,
    definitionAndRationaleColumns,
    { definition: 'text', rationale: 'text' },
  ),
  'period-type': sectionOf(periodTypeSection, periodTypeColumns, {
    periodType: option(PERIOD_TYPE_LABELS),
    yearType: option(YEAR_TYPE_LABELS),
    yearEndDay: entered,
    yearEndMonth: (value) => (isAnswered(value) ? monthName(Number(value)) : null),
  }),
  polarity: sectionOf(polaritySection, polarityColumns, { polarity: option(POLARITY_LABELS) }),
  'data-quality': sectionOf(dataQualitySection, dataQualityColumns, {
    hasDataQualityIssues: yesNo,
  }),
  numerator: sectionOf(numeratorSection, numeratorColumns, {
    sources: providerSources,
    definition: 'text',
  }),
  denominator: sectionOf(denominatorSection, denominatorColumns, {
    sources: providerSources,
    definition: 'text',
  }),
  calculation: sectionOf(calculationSection, calculationColumns, {
    methodology: 'text',
    calculatedBy: option(INDICATOR_CALCULATED_BY_LABELS),
    calculatedByDetail: 'text',
  }),
  'confidence-intervals': sectionOf(confidenceIntervalsSection, confidenceIntervalsColumns, {
    ciMethodId: named,
    hasCiMethodModifications: yesNo,
    ciMethodModificationsDetail: 'text',
    ciMethodDetail: 'text',
  }),
  'update-frequency': sectionOf(updateFrequencySection, updateFrequencyColumns, {
    updateFrequency: option(UPDATE_FREQUENCY_LABELS),
    noFixedFrequencyReason: 'text',
    noLongerUpdatedReason: 'text',
  }),
  'value-type-and-units': sectionOf(valueTypeAndUnitsSection, valueTypeAndUnitsColumns, {
    valueTypeId: named,
    standardPopulation: option(STANDARD_POPULATION_LABELS),
    standardPopulationOther: 'text',
    referencePopulation: 'text',
    unitId: named,
    unitDetail: 'text',
  }),
  'other-notes-and-caveats': sectionOf(otherNotesAndCaveatsSection, otherNotesAndCaveatsColumns, {
    disclosureControl: option(INDICATOR_DISCLOSURE_CONTROL_LABELS),
    disclosureControlDetail: 'text',
    hasRounding: yesNo,
    roundingDetail: 'text',
    hasCaveats: yesNo,
    caveatsDetail: 'text',
    hasOtherNotes: yesNo,
    otherNotesDetail: 'text',
  }),
  'variance-and-quality': sectionOf(varianceAndQualitySection, varianceAndQualityColumns, {
    variation: 'text',
    qualityAssurance: 'text',
    sourceDataIssuesDetail: 'text',
  }),
  justifications: sectionOf(justificationsSection, justificationsColumns, {
    ciMethodJustification: 'text',
    dataSourcesJustification: 'text',
    inequalitiesIncluded: 'text',
    hasExclusions: yesNo,
    exclusionsDetail: 'text',
    hasAutomation: yesNo,
    automationDetail: 'text',
    noAutomationReason: 'text',
  }),
  'other-comments': sectionOf(otherCommentsSection, otherCommentsColumns, {
    sponsorsAndStakeholders: 'text',
    hasReviewerComments: yesNo,
    reviewerCommentsDetail: 'text',
  }),
  'copyright-and-data-reuse': sectionOf(
    copyrightAndDataReuseSection,
    copyrightAndDataReuseColumns,
    {
      hasCustomCopyright: yesNo,
      customCopyrightDetail: 'text',
      hasCustomDataReuse: yesNo,
      customDataReuseDetail: 'text',
    },
  ),
  benchmarking: sectionOf(benchmarkingSection, benchmarkingColumns, {
    hasGoalBenchmark: yesNo,
    goalLowerValue: entered,
    goalUpperValue: entered,
    goalPolarity: option(GOAL_POLARITY_LABELS),
    goalPolicyDetail: 'text',
  }),
  'sex-gender-and-ethnicity': sectionOf(
    sexGenderAndEthnicitySection,
    sexGenderAndEthnicityColumns,
    {
      demographics: options(DEMOGRAPHIC_LABELS),
      sexes: options(SEX_LABELS),
      genders: options(GENDER_LABELS),
      ethnicGroups: options(ETHNIC_GROUP_LABELS),
    },
  ),
  ages: sectionOf(agesSection, agesColumns, {
    ageType: option(AGE_TYPE_LABELS),
    ageRanges,
    specificAge: entered,
    specificAgeUnit: entered,
    ageDetail: 'text',
  }),
  tagging: sectionOf(taggingSection, taggingColumns, {
    isAreaContext: (value) => (value === 'yes' ? 'Yes' : 'No'),
    topicIds: namedList,
    primaryTopicId: named,
    subtopicIds: namedList,
    primarySubtopicId: named,
    indicatorTypeIds: namedList,
    hasLifeStage: yesNo,
    lifeStageIds: namedList,
    hasFramework: yesNo,
    frameworkIds: namedList,
  }),
};

function textOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** The parts of a section that differ between the two versions, in the order its page asks. */
function sectionParts(
  { formValues, fields }: ChangedSection,
  published: IndicatorTaskAnswers,
  submitted: IndicatorTaskAnswers,
  names: ReferenceNames,
): UpdateChangePart[] {
  const before = formValues(published);
  const after = formValues(submitted);

  return Object.entries(fields)
    .filter(([field]) => !isDeepStrictEqual(before[field], after[field]))
    .map(
      ([field, display]): UpdateChangePart =>
        display === 'text'
          ? { kind: 'text', field, before: textOf(before[field]), after: textOf(after[field]) }
          : { kind: 'value', field, value: display(after[field], names) },
    );
}

/** What the update gives as its summary, for the public history and for the reviewers. */
function summaryParts({
  updateSummary,
  updateSummaryForReviewers,
}: IndicatorTaskAnswers): UpdateChangePart[] {
  return Object.entries({ updateSummary, updateSummaryForReviewers })
    .filter(([, value]) => (value ?? '').trim() !== '')
    .map(([field, value]) => ({ kind: 'value', field, value }));
}

/** What the submitted update changes in one task. */
function taskParts(
  task: IndicatorTaskKey,
  published: IndicatorTaskAnswers,
  submitted: IndicatorTaskAnswers,
  names: ReferenceNames,
  replacedValues: number,
): UpdateChangePart[] {
  switch (task) {
    case 'name':
      return [{ kind: 'text', field: 'name', before: published.name, after: submitted.name }];
    case 'data-table':
      return [{ kind: 'data_values_replaced', count: replacedValues }];
    case 'publishing-date':
    case 'update-summary':
      return [];
    default:
      return sectionParts(CHANGED_SECTIONS[task], published, submitted, names);
  }
}

/** Where an update's changes come from: the two versions, and what the submitted one refers to. */
export interface UpdateChangesSource {
  published: IndicatorTaskAnswers;
  submitted: IndicatorTaskAnswers;
  /** The names of the core data either version refers to, by id. */
  names: ReferenceNames;
  /** How many data values the submitted version's own data table holds. */
  replacedValues: number;
}

/**
 * What a submitted update changes from the published version it was opened from, task by task,
 * for its History entry. Each task lists the answers that differ, then the update's summary.
 */
export function updateChanges({
  published,
  submitted,
  names,
  replacedValues,
}: UpdateChangesSource): UpdateChange[] {
  const changes = changedTasks(submitted, published).map((task) => ({
    task,
    parts: taskParts(task, published, submitted, names, replacedValues),
  }));
  const summary = { task: 'update-summary' as const, parts: summaryParts(submitted) };

  return [...changes, summary].filter(({ parts }) => parts.length > 0);
}

/** Every id of core data the version's answers refer to, whose name a change may show. */
export function referencedIds(version: IndicatorTaskAnswers): string[] {
  const ids = [
    version.ciMethodId,
    version.valueTypeId,
    version.unitId,
    ...version.numeratorSources.flatMap(({ providerId, sourceId }) => [providerId, sourceId]),
    ...version.denominatorSources.flatMap(({ providerId, sourceId }) => [providerId, sourceId]),
    ...version.topicIds,
    ...version.subtopicIds,
    ...version.classifications.map(({ id }) => id),
  ];
  return ids.filter((id) => id !== null);
}
