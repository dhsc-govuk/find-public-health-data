// No @fphd/ui imports here, so the rows unit-test without the components' jsdom.
import {
  type AgesField,
  type BenchmarkingField,
  type CalculationField,
  type ConfidenceIntervalsField,
  type CopyrightAndDataReuseField,
  type DefinitionAndRationaleField,
  INDICATOR_TASK_TITLES,
  type IndicatorTaskKey,
  type JustificationsField,
  type OtherCommentsField,
  type OtherNotesAndCaveatsField,
  type PeriodTypeField,
  type ProviderSourcesField,
  type SexGenderAndEthnicityField,
  type TaggingField,
  type UpdateChange,
  type UpdateChangePart,
  type UpdateFrequencyField,
  type ValueTypeAndUnitsField,
  type VarianceAndQualityField,
} from '@fphd/internal-api-features/contract';

import { taskGroups } from '../indicator-tasks.ts';
import { type DiffRun, wordDiff } from './word-diff.ts';

/** One changed answer under a section: its label, then its words added and removed, or its value. */
export interface ChangeLine {
  /** What the answer is called, where its section asks more than one question. */
  label: string | null;
  change: { kind: 'diff'; runs: DiffRun[] } | { kind: 'text'; text: string };
}

/** A row of the Section and Changes table under an update's History entry. */
export interface ChangeRow {
  section: string;
  lines: ChangeLine[];
}

/** The fields each section asks, which name its changed answers. */
interface SectionFields {
  'definition-and-rationale': DefinitionAndRationaleField;
  'period-type': PeriodTypeField;
  numerator: ProviderSourcesField;
  denominator: ProviderSourcesField;
  calculation: CalculationField;
  'confidence-intervals': ConfidenceIntervalsField;
  'update-frequency': UpdateFrequencyField;
  'value-type-and-units': ValueTypeAndUnitsField;
  'other-notes-and-caveats': OtherNotesAndCaveatsField;
  'variance-and-quality': VarianceAndQualityField;
  justifications: JustificationsField;
  'other-comments': OtherCommentsField;
  'copyright-and-data-reuse': CopyrightAndDataReuseField;
  benchmarking: BenchmarkingField;
  'sex-gender-and-ethnicity': SexGenderAndEthnicityField;
  ages: AgesField;
  tagging: TaggingField;
}

/**
 * What each answer is called under its section, in the prototype's words where it has them. A
 * section that asks one question names it by the section alone, so it has no labels here.
 */
const PART_LABELS: { readonly [Task in keyof SectionFields]: Record<SectionFields[Task], string> } =
  {
    'definition-and-rationale': { definition: 'Definition', rationale: 'Rationale' },
    'period-type': {
      periodType: 'Time periods',
      yearType: 'Year type',
      yearEndDay: 'Year end day',
      yearEndMonth: 'Year end month',
    },
    numerator: { sources: 'Data providers and sources', definition: 'Numerator definition' },
    denominator: { sources: 'Data providers and sources', definition: 'Denominator definition' },
    calculation: {
      methodology: 'Methodology',
      calculatedBy: 'Who calculated the indicator',
      calculatedByDetail: 'Other organisations',
    },
    'confidence-intervals': {
      ciMethodId: 'Confidence interval method',
      hasCiMethodModifications: 'Modifications to the method',
      ciMethodModificationsDetail: 'Description of the modifications',
      ciMethodDetail: 'Detail of the other method',
    },
    'update-frequency': {
      updateFrequency: 'Update frequency',
      noFixedFrequencyReason: 'Reason',
      noLongerUpdatedReason: 'Reason',
    },
    'value-type-and-units': {
      valueTypeId: 'Value type',
      standardPopulation: 'Standard population',
      standardPopulationOther: 'Other standard population',
      referencePopulation: 'Reference population',
      unitId: 'Unit',
      unitDetail: 'Other unit',
    },
    'other-notes-and-caveats': {
      disclosureControl: 'Disclosure control',
      disclosureControlDetail: 'Disclosure control detail',
      hasRounding: 'Rounding',
      roundingDetail: 'Rounding detail',
      hasCaveats: 'Caveats needed',
      caveatsDetail: 'Caveats',
      hasOtherNotes: 'Other notes needed',
      otherNotesDetail: 'Other notes',
    },
    'variance-and-quality': {
      variation: 'How the indicator varies',
      qualityAssurance: 'Quality assurance done',
      sourceDataIssuesDetail: 'Data quality improvement notes',
    },
    justifications: {
      ciMethodJustification: 'Confidence interval method',
      dataSourcesJustification: 'Data sources',
      inequalitiesIncluded: 'Health inequalities',
      hasExclusions: 'Exclusions made',
      exclusionsDetail: 'Exclusions',
      hasAutomation: 'Automation tools used',
      automationDetail: 'Automation tools detail',
      noAutomationReason: 'Automation tools reason not used',
    },
    'other-comments': {
      sponsorsAndStakeholders: 'Sponsors',
      hasReviewerComments: 'Has additional comments',
      reviewerCommentsDetail: 'Comments',
    },
    'copyright-and-data-reuse': {
      hasCustomCopyright: 'Custom copyright',
      customCopyrightDetail: 'Copyright detail',
      hasCustomDataReuse: 'Custom data re-use',
      customDataReuseDetail: 'Data re-use detail',
    },
    benchmarking: {
      hasGoalBenchmark: 'Policy goal benchmark',
      goalLowerValue: 'Lower goal value',
      goalUpperValue: 'Upper goal value',
      goalPolarity: 'Polarity of goal',
      goalPolicyDetail: 'Policy goal detail',
    },
    'sex-gender-and-ethnicity': {
      demographics: 'What was collected',
      sexes: 'Sexes',
      genders: 'Genders',
      ethnicGroups: 'Ethnicities',
    },
    ages: {
      ageType: 'Ages included',
      ageRanges: 'Age ranges',
      specificAge: 'Specific age',
      specificAgeUnit: 'Specific age periods',
      ageDetail: 'Other ages',
    },
    tagging: {
      isAreaContext: 'Population or area context',
      topicIds: 'Topics',
      primaryTopicId: 'Primary topic',
      subtopicIds: 'Subtopics',
      primarySubtopicId: 'Primary subtopic',
      indicatorTypeIds: 'Indicator types',
      hasLifeStage: 'Life stage',
      lifeStageIds: 'Life stages',
      hasFramework: 'Framework',
      frameworkIds: 'Frameworks',
    },
  };

/** The label of a changed answer, where its section asks more than one question. */
function partLabel(task: IndicatorTaskKey, field: string): string | null {
  if (!Object.hasOwn(PART_LABELS, task)) return null;
  const labels: Readonly<Record<string, string>> = PART_LABELS[task as keyof SectionFields];
  return Object.hasOwn(labels, field) ? (labels[field] ?? null) : null;
}

/** The update summary's two answers, which each have a row of their own. */
const SUMMARY_SECTIONS: Readonly<Record<string, string>> = {
  updateSummary: 'Update summary',
  updateSummaryForReviewers: 'Additional summary information for internal reviewers',
};

const dataValues = new Intl.NumberFormat('en-GB');

function changeOf(part: UpdateChangePart): ChangeLine['change'] {
  switch (part.kind) {
    case 'text':
      return { kind: 'diff', runs: wordDiff(part.before, part.after) };
    case 'value':
      return { kind: 'text', text: part.value ?? 'None' };
    case 'data_values_replaced':
      return { kind: 'text', text: `${dataValues.format(part.count)} data values replaced` };
  }
}

function lineOf(task: IndicatorTaskKey, part: UpdateChangePart): ChangeLine {
  const label = part.kind === 'data_values_replaced' ? null : partLabel(task, part.field);
  return { label, change: changeOf(part) };
}

/** Every task, in the order an update's task list shows them. */
const TASK_ORDER: readonly IndicatorTaskKey[] = taskGroups(true).flatMap(({ tasks }) =>
  tasks.map(({ key }) => key),
);

/** The update summary's answers, each a row of its own. */
function summaryRows(parts: readonly UpdateChangePart[]): ChangeRow[] {
  return parts.flatMap((part) =>
    part.kind === 'value'
      ? [
          {
            section: SUMMARY_SECTIONS[part.field] ?? part.field,
            lines: [{ label: null, change: changeOf(part) }],
          },
        ]
      : [],
  );
}

/**
 * The rows of an update's Section and Changes table, in task list order. Each changed task is a
 * row of its changed answers, and the update summary gives a row to each of its answers.
 */
export function updateChangeRows(changes: readonly UpdateChange[]): ChangeRow[] {
  return [...changes]
    .sort((a, b) => TASK_ORDER.indexOf(a.task) - TASK_ORDER.indexOf(b.task))
    .flatMap(({ task, parts }) =>
      task === 'update-summary'
        ? summaryRows(parts)
        : [
            {
              section: INDICATOR_TASK_TITLES[task],
              lines: parts.map((part) => lineOf(task, part)),
            },
          ],
    );
}
