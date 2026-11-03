import { type Database, schema } from '@fphd/db';
import { ukDateTime } from '@fphd/utils/uk-time';
import { eq } from 'drizzle-orm';

import {
  type CreatedIndicatorDraft,
  type IndicatorDraftAttributes,
  updateIndicatorDraft,
} from './indicator-draft-repository.ts';
import { ACTOR, AS_ACTOR, classificationIn, onsSources } from './indicator-repository.testing.ts';
import { completeTaskListDraft } from './indicator-task-list.testing.ts';

const { indicatorVersion, topic, uploadBatch } = schema;

/** The draft's `updatedAt`, as a publisher loading its task list would be shown it. */
export async function draftUpdatedAt(db: Database, versionId: string): Promise<Date> {
  const [row] = await db
    .select({ updatedAt: indicatorVersion.updatedAt })
    .from(indicatorVersion)
    .where(eq(indicatorVersion.id, versionId));
  if (row === undefined) throw new Error(`no version ${versionId}`);
  return row.updatedAt;
}

/**
 * Answers every task on a new draft, data table included, so it may be submitted, and answers
 * its `updatedAt` afterwards. The answers are the task list's complete ones, with the seed's ids
 * for everything a list or a batch refers to.
 */
export async function completeDraft(
  db: Database,
  { indicatorId, versionId }: CreatedIndicatorDraft,
): Promise<Date> {
  const {
    name: _name,
    ciMethodKind: _ciMethodKind,
    uploadBatchId: _uploadBatchId,
    links,
    ageRanges,
    topicIds: _topicIds,
    primaryTopicId: _primaryTopicId,
    subtopicIds: _subtopicIds,
    primarySubtopicId: _primarySubtopicId,
    classifications: _classifications,
    numeratorSources: _numeratorSources,
    denominatorSources: _denominatorSources,
    ...columns
  } = completeTaskListDraft;
  // The fixture is built on a draft with every column null, so its answers are the rest.
  const answers: IndicatorDraftAttributes = Object.fromEntries(
    Object.entries(columns).filter(([, value]) => value !== null),
  );
  const [[firstTopic], indicatorType, lifeStage, { onsAlone }] = await Promise.all([
    db.select({ id: topic.id }).from(topic).limit(1),
    classificationIn(db, 'indicator_type'),
    classificationIn(db, 'life_stage'),
    onsSources(db),
  ]);
  if (firstTopic === undefined) throw new Error('The seed holds no topic');
  const [batch] = await db
    .insert(uploadBatch)
    .values({
      indicatorId,
      indicatorVersionId: versionId,
      originalFilename: 'complete.csv',
      uploadedBy: ACTOR,
      status: 'processed',
    })
    .returning({ id: uploadBatch.id });
  if (batch === undefined) throw new Error('inserted no batch');

  const saved = await updateIndicatorDraft(
    db,
    indicatorId,
    { ...answers, uploadBatchId: batch.id },
    {
      links,
      ageRanges,
      topicIds: [firstTopic.id],
      primaryTopicId: firstTopic.id,
      classificationIds: { indicator_type: [indicatorType.id], life_stage: [lifeStage.id] },
      numeratorSources: [onsAlone],
      denominatorSources: [onsAlone],
    },
    AS_ACTOR,
  );
  if (!saved.ok) throw new Error(`completeDraft could not save the draft: ${saved.reason}`);

  return draftUpdatedAt(db, versionId);
}

/** Today's date in the UK, `YYYY-MM-DD`, as an IMRG review date may be. */
export function ukToday(): string {
  const { year, month, day } = ukDateTime(new Date());
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
