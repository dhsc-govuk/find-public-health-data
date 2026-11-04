import { schema } from '@fphd/db';
import { describe, expect, it } from 'vitest';

import {
  justificationsSection,
  otherCommentsSection,
  varianceAndQualitySection,
} from './contract.ts';
import { changesTask, TASK_AUDIT_FIELDS } from './indicator-task-audit-fields.ts';
import { UNORDERED_LISTS } from './indicator-version-lists-repository.ts';

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

const LIST_FIELDS = [
  ...UNORDERED_LISTS,
  'primaryTopicId',
  'links',
  'ageRanges',
  'numeratorSources',
  'denominatorSources',
];

// The notes for reviewers are never flagged, but their columns are still a task's own.
const NOTES_FOR_REVIEWERS_FIELDS = [
  ...varianceAndQualitySection.fields.options,
  ...justificationsSection.fields.options,
  ...otherCommentsSection.fields.options,
];

const columns = Object.keys(schema.indicatorVersion).filter((key) => key !== 'enableRLS');
const mapped = Object.values(TASK_AUDIT_FIELDS).flat();

describe('TASK_AUDIT_FIELDS', () => {
  it('names only the version columns and the lists a save replaces', () => {
    expect(
      mapped.filter((field) => !columns.includes(field) && !LIST_FIELDS.includes(field)),
    ).toEqual([]);
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
    expect(LIST_FIELDS.filter((field) => !mapped.includes(field))).toEqual([]);
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
