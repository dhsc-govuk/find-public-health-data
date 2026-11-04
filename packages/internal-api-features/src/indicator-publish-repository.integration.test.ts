import { type Database, schema } from '@fphd/db';
import { and, desc, eq, sql } from 'drizzle-orm';
import { describe, expect, vi } from 'vitest';

import {
  getIndicatorDraftState,
  type IndicatorDraftAttributes,
  updateIndicatorDraft,
} from './indicator-draft-repository.ts';
import { createDraftFromPublished } from './indicator-publish-repository.ts';
import {
  ACTOR,
  AS_ACTOR,
  ciMethodId,
  classificationIn,
  commentary,
  fingertips,
  indicatorWithTwoPublications,
  newDraft,
  onsSources,
  repositoryTest,
  sixteenPlus,
  storedAgeRangesOf,
  storedClassificationIdsOf,
  storedLinksOf,
  storedTopicIdsOf,
  underFive,
} from './indicator-repository.testing.ts';

const {
  indicatorVersionClassification,
  indicatorVersionTopic,
  indicatorVersion,
  indicatorVersionAgeRange,
  indicatorVersionLink,
  indicatorVersionSource,
} = schema;

async function publishedVersionId(db: Database, indicatorId: string): Promise<string> {
  const [row] = await db
    .select({ id: indicatorVersion.id })
    .from(indicatorVersion)
    .where(
      and(eq(indicatorVersion.indicatorId, indicatorId), eq(indicatorVersion.status, 'published')),
    )
    .orderBy(sql`${indicatorVersion.publishedAt} desc nulls last`, desc(indicatorVersion.id))
    .limit(1);
  if (!row) throw new Error(`indicator ${indicatorId} has no published version`);
  return row.id;
}

describe('createDraftFromPublished', () => {
  repositoryTest(
    'waits for a live refresh before reading the publication to copy',
    async ({ db }) => {
      const { indicatorId, currentId } = await indicatorWithTwoPublications(
        db,
        'Concurrent publication refresh',
      );
      const [before, after] = await db.select({ id: schema.topic.id }).from(schema.topic).limit(2);
      if (!before || !after) throw new Error('The seed holds too few topics');
      const [original, replacement] = await db
        .insert(schema.uploadBatch)
        .values([
          {
            indicatorId,
            indicatorVersionId: currentId,
            originalFilename: 'original.csv',
            uploadedBy: ACTOR,
          },
          {
            indicatorId,
            indicatorVersionId: currentId,
            originalFilename: 'replacement.csv',
            uploadedBy: ACTOR,
          },
        ])
        .returning({ id: schema.uploadBatch.id });
      if (!original || !replacement) throw new Error('Missing refresh batches');
      await db
        .update(indicatorVersion)
        .set({ uploadBatchId: original.id })
        .where(eq(indicatorVersion.id, currentId));
      await db.insert(indicatorVersionTopic).values({
        indicatorVersionId: currentId,
        topicId: before.id,
      });
      let copying: ReturnType<typeof createDraftFromPublished> | undefined;
      try {
        await db.transaction(async (tx) => {
          await tx.execute(sql`LOCK TABLE indicator_version IN SHARE ROW EXCLUSIVE MODE`);
          copying = createDraftFromPublished(db, indicatorId, AS_ACTOR);
          await vi.waitFor(async () => {
            const rows = (await tx.execute(sql`
              SELECT EXISTS (SELECT 1 FROM pg_locks
                WHERE relation = 'indicator_version'::regclass
                  AND mode = 'RowExclusiveLock' AND NOT granted) AS waiting
            `)) as unknown as { waiting: boolean }[];
            expect(rows[0]?.waiting).toBe(true);
          });
          await tx
            .update(indicatorVersion)
            .set({ name: 'Refreshed publication', uploadBatchId: replacement.id })
            .where(eq(indicatorVersion.id, currentId));
          await tx
            .delete(indicatorVersionTopic)
            .where(eq(indicatorVersionTopic.indicatorVersionId, currentId));
          await tx.insert(indicatorVersionTopic).values({
            indicatorVersionId: currentId,
            topicId: after.id,
          });
          await tx.delete(schema.uploadBatch).where(eq(schema.uploadBatch.id, original.id));
        });
        const result = await copying;
        if (!result?.ok) throw new Error('Expected the concurrent draft copy to succeed');
        const [draft] = await db
          .select({ name: indicatorVersion.name, uploadBatchId: indicatorVersion.uploadBatchId })
          .from(indicatorVersion)
          .where(eq(indicatorVersion.id, result.versionId));
        expect(draft).toEqual({ name: 'Refreshed publication', uploadBatchId: replacement.id });
        expect(await storedTopicIdsOf(db, result.versionId)).toEqual([after.id]);
        expect(await storedTopicIdsOf(db, currentId)).toEqual([after.id]);
      } finally {
        await copying;
      }
    },
  );
  repositoryTest(
    'copies the published version columns and lists into a new draft',
    async ({ db, seededIds }) => {
      const target = seededIds[0];
      if (target === undefined) throw new Error('The seed holds no indicators');
      const publishedId = await publishedVersionId(db, target);
      const publishedTopics = await storedTopicIdsOf(db, publishedId);
      expect(publishedTopics.length).toBeGreaterThan(0);

      const result = await createDraftFromPublished(db, target, AS_ACTOR);

      expect(result).toMatchObject({ ok: true });
      if (!result.ok) throw new Error('expected a draft');

      const [published] = await db
        .select()
        .from(indicatorVersion)
        .where(eq(indicatorVersion.id, publishedId));
      const [draft] = await db
        .select()
        .from(indicatorVersion)
        .where(eq(indicatorVersion.id, result.versionId));

      expect(draft).toMatchObject({
        indicatorId: target,
        status: 'draft',
        publishedAt: null,
        name: published?.name,
        slug: published?.slug,
        definition: published?.definition,
        valueTypeId: published?.valueTypeId,
        createdBy: ACTOR,
      });
      expect(await storedTopicIdsOf(db, result.versionId)).toEqual(publishedTopics);
      const placements = async (versionId: string) =>
        db
          .select({
            topicId: schema.indicatorVersionSubtopic.topicId,
            subtopicId: schema.indicatorVersionSubtopic.subtopicId,
            isPrimary: schema.indicatorVersionSubtopic.isPrimary,
          })
          .from(schema.indicatorVersionSubtopic)
          .where(eq(schema.indicatorVersionSubtopic.indicatorVersionId, versionId))
          .orderBy(schema.indicatorVersionSubtopic.subtopicId);
      const primaryTopics = async (versionId: string) =>
        db
          .select({ topicId: indicatorVersionTopic.topicId })
          .from(indicatorVersionTopic)
          .where(
            and(
              eq(indicatorVersionTopic.indicatorVersionId, versionId),
              eq(indicatorVersionTopic.isPrimary, true),
            ),
          );
      expect(await placements(result.versionId)).toEqual(await placements(publishedId));
      expect(await primaryTopics(result.versionId)).toEqual(await primaryTopics(publishedId));
      await updateIndicatorDraft(
        db,
        target,
        'tagging',
        {},
        { topicIds: publishedTopics },
        AS_ACTOR,
      );
      expect(await placements(result.versionId)).toEqual(await placements(publishedId));
      expect(await primaryTopics(result.versionId)).toEqual(await primaryTopics(publishedId));
    },
  );

  repositoryTest(
    "points the new draft at the published version's data, as confirmed",
    async ({ db, seededIds }) => {
      // The first test drafts the newest one.
      const target = seededIds[1];
      if (target === undefined) throw new Error('The seed holds no indicators');
      const [published] = await db
        .select({
          uploadBatchId: indicatorVersion.uploadBatchId,
          dataTableConfirmedAt: indicatorVersion.dataTableConfirmedAt,
        })
        .from(indicatorVersion)
        .where(eq(indicatorVersion.id, await publishedVersionId(db, target)));
      expect(published?.uploadBatchId).toEqual(expect.any(String));
      expect(published?.dataTableConfirmedAt).toEqual(expect.any(Date));

      const result = await createDraftFromPublished(db, target, AS_ACTOR);

      if (!result.ok) throw new Error('expected a draft');
      const [draft] = await db
        .select({
          uploadBatchId: indicatorVersion.uploadBatchId,
          dataTableConfirmedAt: indicatorVersion.dataTableConfirmedAt,
        })
        .from(indicatorVersion)
        .where(eq(indicatorVersion.id, result.versionId));
      expect(draft).toEqual(published);
    },
  );

  repositoryTest('copies the tags of every dimension and their answers', async ({ db }) => {
    const { indicatorId, currentId } = await indicatorWithTwoPublications(
      db,
      'Tagged when published',
    );
    const lifeStage = await classificationIn(db, 'life_stage');
    const framework = await classificationIn(db, 'framework');
    await db
      .update(indicatorVersion)
      .set({ hasLifeStage: true, hasFramework: true })
      .where(eq(indicatorVersion.id, currentId));
    await db.insert(indicatorVersionClassification).values([
      { classificationId: lifeStage.id, indicatorVersionId: currentId },
      { classificationId: framework.id, indicatorVersionId: currentId },
    ]);

    const result = await createDraftFromPublished(db, indicatorId, AS_ACTOR);

    if (!result.ok) throw new Error('expected a draft');
    expect(await storedClassificationIdsOf(db, result.versionId)).toEqual(
      [lifeStage.id, framework.id].sort(),
    );
    const state = await getIndicatorDraftState(db, indicatorId);
    expect(state?.draft).toMatchObject({ hasLifeStage: true, hasFramework: true });
  });

  repositoryTest.for<[string, (db: Database) => Promise<IndicatorDraftAttributes>]>([
    ['who calculated it', async () => ({ calculatedBy: 'other', calculatedByDetail: 'ONS' })],
    ['whether it has data quality issues', async () => ({ hasDataQualityIssues: true })],
    [
      'its confidence interval answers',
      async (db) => ({
        ciMethodId: await ciMethodId(db, 'Other method'),
        hasCiMethodModifications: null,
        ciMethodModificationsDetail: null,
        ciMethodDetail: 'Bootstrap intervals',
      }),
    ],
  ])('copies %s from the published version', async ([copied, columnsOf], { db }) => {
    const { indicatorId, currentId } = await indicatorWithTwoPublications(db, `Copies ${copied}`);
    const columns = await columnsOf(db);
    await db.update(indicatorVersion).set(columns).where(eq(indicatorVersion.id, currentId));

    await createDraftFromPublished(db, indicatorId, AS_ACTOR);

    const state = await getIndicatorDraftState(db, indicatorId);
    expect(state?.draft).toMatchObject(columns);
  });

  repositoryTest(
    'copies the most recently published version, not the superseded one',
    async ({ db }) => {
      const { indicatorId, currentId, currentName, supersededId } =
        await indicatorWithTwoPublications(db, 'Superseded once');
      const [current, superseded] = await db
        .select({ id: schema.topic.id })
        .from(schema.topic)
        .limit(2);
      if (!current || !superseded) throw new Error('The seed holds too few topics');
      await db.insert(indicatorVersionTopic).values([
        { topicId: current.id, indicatorVersionId: currentId },
        { topicId: superseded.id, indicatorVersionId: supersededId },
      ]);

      const result = await createDraftFromPublished(db, indicatorId, AS_ACTOR);

      expect(result).toMatchObject({ ok: true });
      if (!result.ok) throw new Error('expected a draft');
      const [draft] = await db
        .select()
        .from(indicatorVersion)
        .where(eq(indicatorVersion.id, result.versionId));
      expect(draft?.name).toBe(currentName);
      expect(await storedTopicIdsOf(db, result.versionId)).toEqual([current.id]);
    },
  );

  repositoryTest(
    'leaves the new draft unscheduled, whenever the published version was scheduled for',
    async ({ db }) => {
      const { indicatorId, currentId } = await indicatorWithTwoPublications(
        db,
        'Scheduled when published',
      );
      await db
        .update(indicatorVersion)
        .set({ scheduledPublishAt: new Date('2029-12-01T09:30:00.000Z') })
        .where(eq(indicatorVersion.id, currentId));

      const result = await createDraftFromPublished(db, indicatorId, AS_ACTOR);

      if (!result.ok) throw new Error('expected a draft');
      const state = await getIndicatorDraftState(db, indicatorId);
      expect(state?.draft?.scheduledPublishAt).toBeNull();
    },
  );

  repositoryTest(
    'copies the links of the published version in order, leaving them on it too',
    async ({ db }) => {
      const { indicatorId, currentId, supersededId } = await indicatorWithTwoPublications(
        db,
        'Links when published',
      );
      await db
        .update(indicatorVersion)
        .set({ hasLinks: true })
        .where(eq(indicatorVersion.id, currentId));
      await db.insert(indicatorVersionLink).values([
        { indicatorVersionId: currentId, position: 0, ...fingertips },
        { indicatorVersionId: currentId, position: 1, ...commentary },
        {
          indicatorVersionId: supersededId,
          position: 0,
          url: 'https://www.gov.uk/old',
          text: 'Old',
        },
      ]);

      const result = await createDraftFromPublished(db, indicatorId, AS_ACTOR);

      if (!result.ok) throw new Error('expected a draft');
      const state = await getIndicatorDraftState(db, indicatorId);
      expect(state?.draft).toMatchObject({ hasLinks: true, links: [fingertips, commentary] });
      expect(await storedLinksOf(db, currentId)).toEqual([fingertips, commentary]);
    },
  );

  repositoryTest(
    'copies the sexes and age ranges of the published version, leaving them on it too',
    async ({ db }) => {
      const { indicatorId, currentId, supersededId } = await indicatorWithTwoPublications(
        db,
        'Ages when published',
      );
      await db
        .update(indicatorVersion)
        .set({ sexes: ['persons'], ageType: 'range' })
        .where(eq(indicatorVersion.id, currentId));
      await db.insert(indicatorVersionAgeRange).values([
        { indicatorVersionId: currentId, position: 0, ...sixteenPlus },
        { indicatorVersionId: currentId, position: 1, ...underFive },
        { indicatorVersionId: supersededId, position: 0, ...underFive },
      ]);

      const result = await createDraftFromPublished(db, indicatorId, AS_ACTOR);

      if (!result.ok) throw new Error('expected a draft');
      const state = await getIndicatorDraftState(db, indicatorId);
      expect(state?.draft).toMatchObject({
        sexes: ['persons'],
        ageType: 'range',
        ageRanges: [sixteenPlus, underFive],
      });
      expect(await storedAgeRangesOf(db, currentId)).toEqual([sixteenPlus, underFive]);
    },
  );

  repositoryTest(
    'copies the numerator and denominator sources of the published version',
    async ({ db }) => {
      const { indicatorId, currentId } = await indicatorWithTwoPublications(
        db,
        'Sources when published',
      );
      const { liveBirths, onsAlone } = await onsSources(db);
      await db.insert(indicatorVersionSource).values([
        { indicatorVersionId: currentId, part: 'numerator', position: 0, ...liveBirths },
        { indicatorVersionId: currentId, part: 'numerator', position: 1, ...onsAlone },
        { indicatorVersionId: currentId, part: 'denominator', position: 0, ...onsAlone },
      ]);

      const result = await createDraftFromPublished(db, indicatorId, AS_ACTOR);

      if (!result.ok) throw new Error('expected a draft');
      const state = await getIndicatorDraftState(db, indicatorId);
      expect(state?.draft).toMatchObject({
        numeratorSources: [liveBirths, onsAlone],
        denominatorSources: [onsAlone],
      });
    },
  );

  repositoryTest('refuses a second draft for the same indicator', async ({ db }) => {
    const { indicatorId } = await indicatorWithTwoPublications(db, 'Drafted twice');
    await createDraftFromPublished(db, indicatorId, AS_ACTOR);

    await expect(createDraftFromPublished(db, indicatorId, AS_ACTOR)).resolves.toEqual({
      ok: false,
      reason: 'draft_exists',
    });
  });

  repositoryTest('opens the draft unlocked whatever the published version says', async ({ db }) => {
    const { indicatorId, currentId } = await indicatorWithTwoPublications(db, 'Copied unlocked');
    await db
      .update(indicatorVersion)
      .set({ isLocked: true })
      .where(eq(indicatorVersion.id, currentId));

    const result = await createDraftFromPublished(db, indicatorId, AS_ACTOR);

    if (!result.ok) throw new Error('expected a draft');
    const state = await getIndicatorDraftState(db, indicatorId);
    expect(state?.draft?.isLocked).toBe(false);
  });

  repositoryTest('refuses a second draft while the first is locked', async ({ db }) => {
    const { indicatorId } = await indicatorWithTwoPublications(db, 'Drafted beside a lock');
    const first = await createDraftFromPublished(db, indicatorId, AS_ACTOR);
    if (!first.ok) throw new Error('expected a draft');
    await db
      .update(indicatorVersion)
      .set({ isLocked: true })
      .where(eq(indicatorVersion.id, first.versionId));

    await expect(createDraftFromPublished(db, indicatorId, AS_ACTOR)).resolves.toEqual({
      ok: false,
      reason: 'draft_exists',
    });
  });

  repositoryTest('refuses a draft beside a scheduled version', async ({ db }) => {
    const { indicatorId } = await indicatorWithTwoPublications(db, 'Drafted beside a schedule');
    const first = await createDraftFromPublished(db, indicatorId, AS_ACTOR);
    if (!first.ok) throw new Error('expected a draft');
    await db
      .update(indicatorVersion)
      .set({ status: 'scheduled', isLocked: true })
      .where(eq(indicatorVersion.id, first.versionId));

    await expect(createDraftFromPublished(db, indicatorId, AS_ACTOR)).resolves.toEqual({
      ok: false,
      reason: 'draft_exists',
    });
  });

  repositoryTest('refuses an indicator with nothing published', async ({ db }) => {
    const created = await newDraft(db, 'Never published');

    await expect(createDraftFromPublished(db, created.indicatorId, AS_ACTOR)).resolves.toEqual({
      ok: false,
      reason: 'not_published',
    });
  });
});
