import { schema } from '@fphd/db';
import { UNIT_IDS, VALUE_TYPE_IDS } from '@fphd/utils/value-type-and-unit';
import { describe, expect, it } from 'vitest';

import {
  justificationsSection,
  otherCommentsSection,
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
  otherNotesAndCaveatsColumns,
  periodTypeColumns,
  polarityColumns,
  publishingDateColumns,
  updateFrequencyColumns,
  valueTypeAndUnitsColumns,
} from './indicator-section-columns.ts';
import {
  denominatorColumns,
  numeratorColumns,
  sexAndAgesColumns,
  taggingColumns,
} from './indicator-section-list-columns.ts';
import { mortality, publishingDate, tagging } from './indicator-sections.testing.ts';
import {
  changesTask,
  type SavedTaskKey,
  TASK_AUDIT_FIELDS,
} from './indicator-task-audit-fields.ts';
import {
  classificationAuditField,
  type IndicatorDraftLists,
  LIST_AUDIT_FIELDS,
} from './indicator-version-lists-repository.ts';

// The version's columns no task's save writes: identity, workflow, the data table and legacy ones.
const UNSAVED_COLUMNS = [
  'id',
  'indicatorId',
  'status',
  'isLocked',
  'publishedAt',
  'uploadBatchId',
  'dataTableConfirmedAt',
  'dataSourceId',
  'ciConfidenceLevel',
  'comparatorMethodId',
  'hasRiskFactor',
  'createdAt',
  'updatedAt',
  'createdBy',
  'updatedBy',
];

// The notes for reviewers are never flagged, but their columns are still a task's own.
const NOTES_FOR_REVIEWERS_FIELDS = [
  ...varianceAndQualitySection.fields.options,
  ...justificationsSection.fields.options,
  ...otherCommentsSection.fields.options,
];

const columns = Object.keys(schema.indicatorVersion).filter((key) => key !== 'enableRLS');
const mapped = Object.values(TASK_AUDIT_FIELDS).flat();

/** The audit fields a save of these lists records, as `replaceLists` names them. */
function listAuditFields(lists: IndicatorDraftLists): string[] {
  return Object.entries(lists).flatMap(([list, value]) => {
    if (list === 'subtopicIds' || list === 'primarySubtopicId') return ['subtopicPlacements'];
    if (list === 'classificationIds') {
      return Object.keys(value ?? {}).map((dimension) =>
        classificationAuditField(dimension as Parameters<typeof classificationAuditField>[0]),
      );
    }
    return [list];
  });
}

/** The audit fields one save of `values` through `columns` records. */
function savedFields<Field extends string, Values, Answers>(
  sectionColumns: IndicatorSectionColumns<Field, Values, Answers>,
  values: Values,
): string[] {
  return [
    ...Object.keys(sectionColumns.toAttributes(values)),
    ...listAuditFields(sectionColumns.toLists?.(values) ?? {}),
  ];
}

// A valid answer to each task, every follow-up given, saved as its page saves it.
const SAVES: Readonly<Record<SavedTaskKey, () => string[]>> = {
  // The name's save writes the name, and the repository its slug.
  name: () => ['name', 'slug'],
  'definition-and-rationale': () =>
    savedFields(definitionAndRationaleColumns, { definition: 'Deaths', rationale: 'Why' }),
  polarity: () => savedFields(polarityColumns, { polarity: 'lower-is-better' }),
  'data-quality': () => savedFields(dataQualityColumns, { hasDataQualityIssues: 'yes' }),
  numerator: () => savedFields(numeratorColumns, { sources: [mortality], definition: 'Deaths' }),
  denominator: () =>
    savedFields(denominatorColumns, { sources: [mortality], definition: 'Population' }),
  calculation: () =>
    savedFields(calculationColumns, {
      methodology: 'Counted',
      calculatedBy: 'other',
      calculatedByDetail: 'A university',
    }),
  'confidence-intervals': () =>
    savedFields(confidenceIntervalsColumns, {
      ciMethodId: '019fa38f-073f-764e-9ac6-1c4d03b1cb92',
      hasCiMethodModifications: 'yes',
      ciMethodModificationsDetail: 'Adjusted',
      ciMethodDetail: 'Bootstrap',
      kind: 'standard',
    }),
  'update-frequency': () =>
    savedFields(updateFrequencyColumns, {
      updateFrequency: 'no-fixed-frequency',
      noFixedFrequencyReason: 'Published when the survey runs.',
      noLongerUpdatedReason: '',
    }),
  'value-type-and-units': () =>
    savedFields(valueTypeAndUnitsColumns, {
      valueTypeId: VALUE_TYPE_IDS.directlyStandardisedRate,
      standardPopulation: 'other',
      standardPopulationOther: 'England 2021',
      referencePopulation: '',
      unitId: UNIT_IDS.other,
      unitDetail: 'people',
    }),
  'period-type': () =>
    savedFields(periodTypeColumns, {
      periodType: 'years',
      yearType: 'specified-end-date',
      yearEndDay: '31',
      yearEndMonth: '3',
    }),
  'other-notes-and-caveats': () =>
    savedFields(otherNotesAndCaveatsColumns, {
      disclosureControl: 'yes',
      disclosureControlDetail: 'Suppressed under 5',
      hasRounding: 'yes',
      roundingDetail: 'To 5',
      hasCaveats: 'yes',
      caveatsDetail: 'Survey data',
      hasOtherNotes: 'yes',
      otherNotesDetail: 'Revised',
    }),
  'publishing-date': () =>
    savedFields(publishingDateColumns, {
      ...publishingDate,
      scheduledPublishAt: new Date('2027-09-14T08:30:00.000Z'),
    }),
  'copyright-and-data-reuse': () =>
    savedFields(copyrightAndDataReuseColumns, {
      hasCustomCopyright: 'yes',
      customCopyrightDetail: 'Crown copyright',
      hasCustomDataReuse: 'yes',
      customDataReuseDetail: 'Open Government Licence',
    }),
  benchmarking: () =>
    savedFields(benchmarkingColumns, {
      hasGoalBenchmark: 'yes',
      goalLowerValue: '1',
      goalUpperValue: '2',
      goalPolarity: 'higher-is-better',
      goalPolicyDetail: 'An ambition',
    }),
  'sex-and-ages': () =>
    savedFields(sexAndAgesColumns, {
      sexes: ['females'],
      ageType: 'range',
      ageRanges: [
        { lowerLimit: '16', lowerLimitUnit: 'years', upperLimit: '', upperLimitUnit: '' },
      ],
      specificAge: '',
      specificAgeUnit: '',
      ageDetail: '',
    }),
  tagging: () => savedFields(taggingColumns, tagging),
};

describe('TASK_AUDIT_FIELDS', () => {
  it.each(Object.entries(SAVES))('holds every field a %s save records', (task, saved) => {
    const fields = TASK_AUDIT_FIELDS[task as SavedTaskKey];

    expect(saved().filter((field) => !fields.includes(field))).toEqual([]);
  });

  it('names only the version columns and the lists a save replaces', () => {
    const lists: readonly string[] = LIST_AUDIT_FIELDS;

    expect(mapped.filter((field) => !columns.includes(field) && !lists.includes(field))).toEqual(
      [],
    );
  });

  it('gives each field to one task', () => {
    const all = [...mapped, ...NOTES_FOR_REVIEWERS_FIELDS];
    expect(all.filter((field, index) => all.indexOf(field) !== index)).toEqual([]);
  });

  it('covers every column a task saves', () => {
    const owned = new Set([...mapped, ...NOTES_FOR_REVIEWERS_FIELDS, ...UNSAVED_COLUMNS]);
    expect(columns.filter((column) => !owned.has(column))).toEqual([]);
  });

  it('covers every list a save replaces', () => {
    expect(LIST_AUDIT_FIELDS.filter((field) => !mapped.includes(field))).toEqual([]);
  });
});

describe('changesTask', () => {
  it('holds when a change touches one of the task’s fields', () => {
    expect(changesTask('polarity', ['polarity'])).toBe(true);
    expect(changesTask('tagging', ['classificationIds.lifeStage'])).toBe(true);
    expect(changesTask('value-type-and-units', ['standardPopulationDetail'])).toBe(true);
  });

  it('fails when the change touches only other tasks’ fields or the flag', () => {
    expect(changesTask('polarity', ['definition', 'flags'])).toBe(false);
    expect(changesTask('name', [])).toBe(false);
  });
});
