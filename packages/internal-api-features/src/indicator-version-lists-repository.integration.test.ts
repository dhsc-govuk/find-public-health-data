import { schema } from '@fphd/db';
import { auditEntriesFor } from '@fphd/db/testing';
import { MAX_AGE } from '@fphd/utils/sex-and-ages';
import { desc, eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import { getIndicatorDraftState, updateIndicatorDraft } from './indicator-draft-repository.ts';
import {
  AS_ACTOR,
  classificationIn,
  commentary,
  fingertips,
  newDraft,
  onsSources,
  repositoryTest,
  sixteenPlus,
  storedAgeRangesOf,
  storedClassificationIdsOf,
  storedLinksOf,
  storedTopicIdsOf,
  typeClassification,
  underFive,
} from './indicator-repository.testing.ts';
import type { IndicatorDraftAgeRange } from './indicator-version-lists-repository.ts';

const { indicatorVersionClassification } = schema;

describe('updateIndicatorDraft', () => {
  repositoryTest(
    'replaces primary and subtopic placements together when the primary topic is removed',
    async ({ db }) => {
      const created = await newDraft(db, 'Editable taxonomy placements');
      const children = await db.select().from(schema.subtopic);
      const first = children[0];
      const second = children.find(({ topicId }) => topicId !== first?.topicId);
      if (!first || !second) throw new Error('Core data needs subtopics in two topics');
      await updateIndicatorDraft(
        db,
        created.indicatorId,
        'tagging',
        {},
        {
          topicIds: [first.topicId, second.topicId],
          primaryTopicId: first.topicId,
          subtopicIds: [first.id, second.id],
          primarySubtopicId: first.id,
        },
        AS_ACTOR,
      );
      expect((await getIndicatorDraftState(db, created.indicatorId))?.draft).toMatchObject({
        primaryTopicId: first.topicId,
        primarySubtopicId: first.id,
        subtopicIds: expect.arrayContaining([first.id, second.id]),
      });
      await updateIndicatorDraft(
        db,
        created.indicatorId,
        'tagging',
        {},
        {
          topicIds: [second.topicId],
          primaryTopicId: second.topicId,
          subtopicIds: [second.id],
          primarySubtopicId: second.id,
        },
        AS_ACTOR,
      );
      expect((await getIndicatorDraftState(db, created.indicatorId))?.draft).toMatchObject({
        topicIds: [second.topicId],
        primaryTopicId: second.topicId,
        subtopicIds: [second.id],
        primarySubtopicId: second.id,
      });
      const changes = (await auditEntriesFor(db, created.indicatorId)).at(-1)?.changes;
      expect(changes).toMatchObject({
        primaryTopicId: { before: [first.topicId], after: [second.topicId] },
      });
    },
  );

  repositoryTest('leaves the lists alone when the update names none', async ({ db }) => {
    const created = await newDraft(db, 'Keeps its links');
    const [topic] = await db.select({ id: schema.topic.id }).from(schema.topic).limit(1);
    const classified = await typeClassification(db);
    if (!topic || !classified) throw new Error('The core data holds no topics or classifications');
    await updateIndicatorDraft(
      db,
      created.indicatorId,
      'tagging',
      {},
      {
        topicIds: [topic.id],
        classificationIds: { indicator_type: [classified.id] },
        links: [commentary],
      },
      AS_ACTOR,
    );

    await updateIndicatorDraft(
      db,
      created.indicatorId,
      'name',
      { name: 'Keeps its links renamed' },
      {},
      AS_ACTOR,
    );

    expect(await storedTopicIdsOf(db, created.versionId)).toEqual([topic.id]);
    const classifications = await db
      .select({ id: indicatorVersionClassification.classificationId })
      .from(indicatorVersionClassification)
      .where(eq(indicatorVersionClassification.indicatorVersionId, created.versionId));
    expect(classifications).toEqual([{ id: classified.id }]);
    expect(await storedLinksOf(db, created.versionId)).toEqual([commentary]);
  });

  repositoryTest(
    'replaces the classifications of the dimensions given and leaves the others',
    async ({ db }) => {
      const created = await newDraft(db, 'Tagged by dimension');
      const framework = await classificationIn(db, 'framework');
      const lifeStage = await classificationIn(db, 'life_stage');
      const type = await typeClassification(db);
      await updateIndicatorDraft(
        db,
        created.indicatorId,
        'tagging',
        {},
        { classificationIds: { framework: [framework.id], life_stage: [lifeStage.id] } },
        AS_ACTOR,
      );

      await updateIndicatorDraft(
        db,
        created.indicatorId,
        'tagging',
        {},
        { classificationIds: { indicator_type: [type.id], life_stage: [] } },
        AS_ACTOR,
      );

      expect(await storedClassificationIdsOf(db, created.versionId)).toEqual(
        [framework.id, type.id].sort(),
      );
      // Each dimension given is its own list in the log; the framework it left is not in it.
      expect((await auditEntriesFor(db, created.indicatorId)).at(-1)?.changes).toEqual({
        'classificationIds.indicatorType': { before: [], after: [type.id] },
        'classificationIds.lifeStage': { before: [lifeStage.id], after: [] },
      });
    },
  );

  repositoryTest('reads back the tags and their answers', async ({ db }) => {
    const created = await newDraft(db, 'Tags read back');
    const topics = await db
      .select({ id: schema.topic.id, title: schema.topic.title })
      .from(schema.topic)
      .orderBy(desc(schema.topic.title))
      .limit(2);
    const lifeStage = await classificationIn(db, 'life_stage');

    await updateIndicatorDraft(
      db,
      created.indicatorId,
      'tagging',
      { hasLifeStage: true, hasFramework: false },
      {
        topicIds: topics.map(({ id }) => id),
        classificationIds: { life_stage: [lifeStage.id] },
      },
      AS_ACTOR,
    );

    const state = await getIndicatorDraftState(db, created.indicatorId);
    expect(state?.draft).toMatchObject({
      hasLifeStage: true,
      hasFramework: false,
      // Ordered by title, whatever order they were written in.
      topicIds: topics.map(({ id }) => id).reverse(),
      classifications: [{ id: lifeStage.id, dimension: 'life_stage' }],
    });
  });

  repositoryTest(
    'writes the links in the order given, replacing those held before',
    async ({ db }) => {
      const created = await newDraft(db, 'Links in order');

      await updateIndicatorDraft(
        db,
        created.indicatorId,
        'links',
        { hasLinks: true },
        { links: [commentary, fingertips] },
        AS_ACTOR,
      );
      const first = await getIndicatorDraftState(db, created.indicatorId);
      await updateIndicatorDraft(
        db,
        created.indicatorId,
        'links',
        {},
        { links: [fingertips] },
        AS_ACTOR,
      );
      const replaced = await getIndicatorDraftState(db, created.indicatorId);
      await updateIndicatorDraft(
        db,
        created.indicatorId,
        'links',
        { hasLinks: false },
        { links: [] },
        AS_ACTOR,
      );
      const cleared = await getIndicatorDraftState(db, created.indicatorId);

      expect(first?.draft).toMatchObject({ hasLinks: true, links: [commentary, fingertips] });
      expect(replaced?.draft?.links).toEqual([fingertips]);
      expect(cleared?.draft).toMatchObject({ hasLinks: false, links: [] });
    },
  );

  repositoryTest(
    'writes the sexes and age ranges in the order given, replacing those held before',
    async ({ db }) => {
      const created = await newDraft(db, 'Ages in order');

      await updateIndicatorDraft(
        db,
        created.indicatorId,
        'sex-and-ages',
        { sexes: ['females', 'males'], ageType: 'range' },
        { ageRanges: [underFive, sixteenPlus] },
        AS_ACTOR,
      );
      const first = await getIndicatorDraftState(db, created.indicatorId);
      await updateIndicatorDraft(
        db,
        created.indicatorId,
        'sex-and-ages',
        { ageType: 'specific', specificAge: 5, specificAgeUnit: 'weeks' },
        { ageRanges: [] },
        AS_ACTOR,
      );
      const replaced = await getIndicatorDraftState(db, created.indicatorId);

      expect(first?.draft).toMatchObject({
        sexes: ['females', 'males'],
        ageType: 'range',
        ageRanges: [underFive, sixteenPlus],
      });
      expect(replaced?.draft).toMatchObject({
        ageType: 'specific',
        specificAge: 5,
        specificAgeUnit: 'weeks',
        ageRanges: [],
      });
    },
  );

  repositoryTest('holds ages up to the highest', async ({ db }) => {
    const created = await newDraft(db, 'Ages up to the highest');
    const oldest = { ...underFive, upperLimit: MAX_AGE };

    await updateIndicatorDraft(
      db,
      created.indicatorId,
      'sex-and-ages',
      { ageType: 'range' },
      { ageRanges: [oldest] },
      AS_ACTOR,
    );
    await updateIndicatorDraft(
      db,
      created.indicatorId,
      'sex-and-ages',
      { ageType: 'specific', specificAge: MAX_AGE, specificAgeUnit: 'days' },
      {},
      AS_ACTOR,
    );

    expect((await getIndicatorDraftState(db, created.indicatorId))?.draft).toMatchObject({
      specificAge: MAX_AGE,
      ageRanges: [oldest],
    });
  });

  repositoryTest.for<[string, IndicatorDraftAgeRange]>([
    ['no limit', { ...sixteenPlus, lowerLimit: null, lowerLimitUnit: null }],
    ['a limit without its unit', { ...sixteenPlus, lowerLimitUnit: null }],
    ['a unit without its limit', { ...underFive, lowerLimitUnit: 'years' }],
    ['a negative limit', { ...sixteenPlus, lowerLimit: -1 }],
    ['a limit above the highest', { ...underFive, upperLimit: MAX_AGE + 1 }],
    [
      'an upper limit below the lower',
      { lowerLimit: 5, lowerLimitUnit: 'years', upperLimit: 4, upperLimitUnit: 'years' },
    ],
  ])('refuses an age range with %s', async ([name, ageRange], { db }) => {
    const created = await newDraft(db, `Refuses a range with ${name}`);

    await expect(
      updateIndicatorDraft(
        db,
        created.indicatorId,
        'sex-and-ages',
        {},
        { ageRanges: [ageRange] },
        AS_ACTOR,
      ),
    ).rejects.toThrow();
  });

  repositoryTest(
    'holds an upper limit the same age as the lower in another unit',
    async ({ db }) => {
      const created = await newDraft(db, 'Limits in different units');
      const firstYear = {
        lowerLimit: 12,
        lowerLimitUnit: 'months',
        upperLimit: 1,
        upperLimitUnit: 'years',
      } as const;

      await updateIndicatorDraft(
        db,
        created.indicatorId,
        'sex-and-ages',
        { ageType: 'range' },
        { ageRanges: [firstYear] },
        AS_ACTOR,
      );

      expect(await storedAgeRangesOf(db, created.versionId)).toEqual([firstYear]);
    },
  );

  repositoryTest(
    "writes each part's sources in the order given, replacing that part's alone",
    async ({ db }) => {
      const created = await newDraft(db, 'Sources in order');
      const { liveBirths, onsAlone } = await onsSources(db);

      await updateIndicatorDraft(
        db,
        created.indicatorId,
        'numerator',
        {},
        { numeratorSources: [liveBirths, onsAlone], denominatorSources: [onsAlone] },
        AS_ACTOR,
      );
      const first = await getIndicatorDraftState(db, created.indicatorId);
      await updateIndicatorDraft(
        db,
        created.indicatorId,
        'numerator',
        {},
        { numeratorSources: [onsAlone] },
        AS_ACTOR,
      );
      const replaced = await getIndicatorDraftState(db, created.indicatorId);

      expect(first?.draft).toMatchObject({
        numeratorSources: [liveBirths, onsAlone],
        denominatorSources: [onsAlone],
      });
      expect(replaced?.draft).toMatchObject({
        numeratorSources: [onsAlone],
        denominatorSources: [onsAlone],
      });
    },
  );

  repositoryTest('refuses a source under a provider it does not belong to', async ({ db }) => {
    const created = await newDraft(db, 'Source under another provider');
    const { liveBirths } = await onsSources(db);
    const [other] = await db
      .select({ id: schema.dataProvider.id })
      .from(schema.dataProvider)
      .where(eq(schema.dataProvider.name, 'Estimated'));
    if (!other) throw new Error('The core data holds no Estimated provider');

    await expect(
      updateIndicatorDraft(
        db,
        created.indicatorId,
        'numerator',
        {},
        { numeratorSources: [{ providerId: other.id, sourceId: liveBirths.sourceId }] },
        AS_ACTOR,
      ),
    ).rejects.toThrow();
  });
});

describe('indicator_version_classification', () => {
  repositoryTest('follows the draft rather than the indicator', async ({ db }) => {
    const created = await newDraft(db, 'Classified');
    const classified = await typeClassification(db);
    if (!classified) throw new Error('The core data holds no classifications');

    await updateIndicatorDraft(
      db,
      created.indicatorId,
      'tagging',
      {},
      { classificationIds: { indicator_type: [classified.id] } },
      AS_ACTOR,
    );

    const rows = await db
      .select({ versionId: indicatorVersionClassification.indicatorVersionId })
      .from(indicatorVersionClassification)
      .where(eq(indicatorVersionClassification.indicatorVersionId, created.versionId));

    expect(rows).toEqual([{ versionId: created.versionId }]);
  });
});
