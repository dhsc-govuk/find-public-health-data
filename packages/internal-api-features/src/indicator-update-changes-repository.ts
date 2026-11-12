import { schema } from '@fphd/db';
import { changesBetween } from '@fphd/db/audit-log';
import type { IndicatorStepWrite } from '@fphd/internal-workflow';
import { eq, inArray } from 'drizzle-orm';
import { unionAll } from 'drizzle-orm/pg-core';

import { draftListsOf, getPublishedAnswers } from './indicator-draft-repository.ts';
import type { Transaction } from './indicator-repository-sql.ts';
import { type ReferenceNames, referencedIds, updateChanges } from './indicator-update-changes.ts';

const {
  ciMethod,
  classification,
  dataProvider,
  dataProviderSource,
  indicatorVersionSubmission,
  subtopic,
  topic,
  unit,
  uploadBatch,
  valueType,
} = schema;

/**
 * The names of the core data the ids refer to, in one statement: CI methods, value types, units,
 * data providers and their sources, topics, subtopics and classifications. Ids are UUIDs, so no
 * two tables share one.
 */
async function referenceNamesOf(tx: Transaction, ids: readonly string[]): Promise<ReferenceNames> {
  if (ids.length === 0) return new Map();
  const among = [...new Set(ids)];

  const rows = await unionAll(
    tx
      .select({ id: ciMethod.id, name: ciMethod.name })
      .from(ciMethod)
      .where(inArray(ciMethod.id, among)),
    tx
      .select({ id: valueType.id, name: valueType.name })
      .from(valueType)
      .where(inArray(valueType.id, among)),
    tx.select({ id: unit.id, name: unit.name }).from(unit).where(inArray(unit.id, among)),
    tx
      .select({ id: dataProvider.id, name: dataProvider.name })
      .from(dataProvider)
      .where(inArray(dataProvider.id, among)),
    tx
      .select({ id: dataProviderSource.id, name: dataProviderSource.name })
      .from(dataProviderSource)
      .where(inArray(dataProviderSource.id, among)),
    tx.select({ id: topic.id, name: topic.title }).from(topic).where(inArray(topic.id, among)),
    tx
      .select({ id: subtopic.id, name: subtopic.title })
      .from(subtopic)
      .where(inArray(subtopic.id, among)),
    tx
      .select({ id: classification.id, name: classification.name })
      .from(classification)
      .where(inArray(classification.id, among)),
  );

  return new Map(rows.map(({ id, name }) => [id, name]));
}

/** How many data values the data table holds, as its check page counts them. */
async function dataValueCountOf(tx: Transaction, batchId: string | null): Promise<number> {
  if (batchId === null) return 0;
  const [batch] = await tx
    .select({ rowCount: uploadBatch.rowCount })
    .from(uploadBatch)
    .where(eq(uploadBatch.id, batchId));
  return batch?.rowCount ?? 0;
}

/**
 * The submit step's write for an update to a live indicator. It keeps what the update changed from
 * the published version on the new submission, so its History entry shows the changes as they were
 * submitted, before any later edit or publication. A new indicator's submission keeps nothing.
 */
export const recordUpdateChanges: IndicatorStepWrite = async (tx, submission, draft) => {
  const published = await getPublishedAnswers(tx, draft.indicatorId);
  if (published === undefined) return {};

  const submitted = { ...draft, ...(await draftListsOf(tx, draft.id)) };
  const [names, replacedValues] = await Promise.all([
    referenceNamesOf(tx, [...referencedIds(published), ...referencedIds(submitted)]),
    dataValueCountOf(tx, submitted.uploadBatchId),
  ]);
  const changes = updateChanges({ published, submitted, names, replacedValues });

  await tx
    .update(indicatorVersionSubmission)
    .set({ updateChanges: changes })
    .where(eq(indicatorVersionSubmission.id, submission.id));

  return changesBetween({ updateChanges: null }, { updateChanges: changes });
};
