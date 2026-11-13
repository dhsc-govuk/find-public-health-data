import type { FlaggableTaskKey } from '@fphd/utils/indicator-task-key';

import {
  agesSection,
  benchmarkingSection,
  calculationSection,
  confidenceIntervalsSection,
  copyrightAndDataReuseSection,
  dataQualitySection,
  definitionAndRationaleSection,
  otherNotesAndCaveatsSection,
  periodTypeSection,
  polaritySection,
  sexGenderAndEthnicitySection,
  valueTypeAndUnitsSection,
} from './contract.ts';
import { UNORDERED_LISTS } from './indicator-version-lists-repository.ts';

/** The tasks a publisher saves from a page of answers, which the data table is not. */
export type SavedTaskKey = Exclude<FlaggableTaskKey, 'data-table'>;

/**
 * The fields an `indicator.draft_updated` entry names when each task's save changes them: the
 * draft's columns and the lists the save replaces. An entry does not name its task, so a change
 * is put down to the task whose fields it touches. Every field belongs to one task.
 */
export const TASK_AUDIT_FIELDS: Readonly<Record<SavedTaskKey, readonly string[]>> = {
  name: ['name', 'slug'],
  'definition-and-rationale': definitionAndRationaleSection.fields.options,
  polarity: polaritySection.fields.options,
  'data-quality': dataQualitySection.fields.options,
  numerator: ['numeratorDefinition', 'numeratorSources'],
  denominator: ['denominatorDefinition', 'denominatorSources'],
  calculation: calculationSection.fields.options,
  'confidence-intervals': confidenceIntervalsSection.fields.options,
  'update-frequency': ['updateFrequency', 'updateFrequencyReason'],
  'value-type-and-units': [
    ...valueTypeAndUnitsSection.fields.options.filter(
      (field) => field !== 'standardPopulationOther' && field !== 'referencePopulation',
    ),
    'standardPopulationDetail',
  ],
  'period-type': periodTypeSection.fields.options,
  'other-notes-and-caveats': otherNotesAndCaveatsSection.fields.options,
  'publishing-date': ['scheduledPublishAt'],
  'copyright-and-data-reuse': copyrightAndDataReuseSection.fields.options,
  benchmarking: benchmarkingSection.fields.options,
  'sex-gender-and-ethnicity': sexGenderAndEthnicitySection.fields.options,
  ages: agesSection.fields.options,
  tagging: [...UNORDERED_LISTS, 'primaryTopicId', 'isAreaContext', 'hasLifeStage', 'hasFramework'],
};

/** Whether a save that changed `fields` changed any of the task's answers. */
export function changesTask(task: SavedTaskKey, fields: readonly string[]): boolean {
  return TASK_AUDIT_FIELDS[task].some((field) => fields.includes(field));
}
