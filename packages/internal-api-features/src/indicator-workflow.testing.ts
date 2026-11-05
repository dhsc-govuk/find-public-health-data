import { FAKE_USER_IDS } from '@fphd/auth';
import { type Database, schema } from '@fphd/db';
import type { Actor } from '@fphd/db/audit-log';
import type { FlaggableTaskKey } from '@fphd/utils/indicator-task-key';
import { ukDateTime } from '@fphd/utils/uk-time';
import { eq } from 'drizzle-orm';

import {
  type CreatedIndicatorDraft,
  type IndicatorDraftAttributes,
  updateIndicatorDraft,
} from './indicator-draft-repository.ts';
import {
  ACTOR,
  AS_ACTOR,
  classificationIn,
  newDraft,
  onsSources,
} from './indicator-repository.testing.ts';
import { completeTaskListDraft } from './indicator-task-list.testing.ts';
import { assignReviewers, submitIndicator } from './indicator-workflow-repository.ts';
import { type ReviewResponse, respondToReview } from './review-response-repository.ts';

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
    'tagging',
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

export const AS_REVIEWER: Actor = { userId: FAKE_USER_IDS.imrgReviewer, requestId: null };

/** A draft sent back for changes, the `updatedAt` its task list shows, and its data table. */
export interface SentBackDraft {
  indicatorId: string;
  versionId: string;
  batchId: string;
  shown: Date;
}

/**
 * A complete new draft, submitted by the repository tests' actor, put in review with the IMRG
 * reviewer, and sent back with the reviewer's response: minor revisions flagging `flags` unless
 * `response` says otherwise.
 */
export async function sentBackDraft(
  db: Database,
  name: string,
  flags: readonly FlaggableTaskKey[],
  response: Partial<ReviewResponse> = {},
): Promise<SentBackDraft> {
  const draft = await newDraft(db, name);
  const submitted = await submitIndicator(
    db,
    draft.indicatorId,
    await completeDraft(db, draft),
    AS_ACTOR,
  );
  if (!submitted.ok) throw new Error(`sentBackDraft could not submit: ${submitted.reason}`);
  await assignReviewers(
    db,
    draft.indicatorId,
    { submissionNumber: 1, previousReviewerIds: [], reviewerIds: [FAKE_USER_IDS.imrgReviewer] },
    { userId: FAKE_USER_IDS.imrgManager, requestId: null },
  );
  const responded = await respondToReview(
    db,
    draft.indicatorId,
    {
      submissionNumber: 1,
      kind: 'minor_revisions',
      imrgReviewedOn: ukToday(),
      clarificationRequest: null,
      flags: flags.map((task) => ({ task, notes: `Revise ${task}` })),
      ...response,
    },
    AS_REVIEWER,
  );
  if (!responded.ok) throw new Error(`sentBackDraft could not respond: ${responded.reason}`);
  const [row] = await db
    .select({ batchId: indicatorVersion.uploadBatchId })
    .from(indicatorVersion)
    .where(eq(indicatorVersion.id, draft.versionId));
  if (!row?.batchId) throw new Error(`sentBackDraft found no data table on ${draft.versionId}`);
  return {
    ...draft,
    batchId: row.batchId,
    shown: await draftUpdatedAt(db, draft.versionId),
  };
}

/**
 * A complete new draft IMRG approved, then scheduled, as an admin's confirmation of its
 * publication date leaves it. The reviewer stays assigned to the approved submission.
 */
export async function scheduledDraft(db: Database, name: string): Promise<SentBackDraft> {
  const draft = await sentBackDraft(db, name, [], { kind: 'approved' });
  await db
    .update(indicatorVersion)
    .set({ status: 'scheduled' })
    .where(eq(indicatorVersion.id, draft.versionId));
  return draft;
}
