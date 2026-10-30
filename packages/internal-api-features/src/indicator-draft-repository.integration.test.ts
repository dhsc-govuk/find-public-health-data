import { TEAM_IDS } from '@fphd/auth';
import { type Database, schema } from '@fphd/db';
import { auditEntriesFor } from '@fphd/db/testing';
import { MAX_AGE } from '@fphd/utils/sex-and-ages';
import { eq, sql } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import { editVersion } from './edit-version.ts';
import {
  createIndicatorDraft,
  getIndicatorDraftState,
  getIndicatorPublishedVersion,
  type IndicatorDraft,
  type IndicatorDraftAttributes,
  SLUG_LOCK_NAMESPACE,
  updateIndicatorDraft,
} from './indicator-draft-repository.ts';
import { getIndicatorById } from './indicator-list-repository.ts';
import { createDraftFromPublished } from './indicator-publish-repository.ts';
import {
  ACTOR,
  AS_ACTOR,
  AS_OTHER_ACTOR,
  ciMethodId,
  indicatorWithTwoPublications,
  lockWaited,
  lockWaiters,
  newDraft,
  OTHER_ACTOR,
  repositoryTest,
  storedTopicIdsOf,
  typeClassification,
} from './indicator-repository.testing.ts';
import { completeDraft } from './indicator-workflow.testing.ts';
import { submitIndicator } from './indicator-workflow-repository.ts';

const { indicator, indicatorVersion } = schema;

async function slugOf(db: Database, versionId: string): Promise<string | undefined> {
  const [row] = await db
    .select({ slug: indicatorVersion.slug })
    .from(indicatorVersion)
    .where(eq(indicatorVersion.id, versionId));
  return row?.slug;
}

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Sessions in this test's database waiting on a slug lock. */
async function slugLockWaiters(db: Database): Promise<number> {
  const [row] = (await db.execute(sql`
    SELECT count(*)::int AS waiting FROM pg_locks
    WHERE locktype = 'advisory' AND NOT granted AND classid = ${SLUG_LOCK_NAMESPACE}::oid
      AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
  `)) as unknown as { waiting: number }[];
  return row?.waiting ?? 0;
}

/**
 * Starts `write` while another transaction holds the slug's lock, having done `hold` first,
 * and answers what the write returns once that transaction commits. The write must be seen
 * waiting on the lock, so a write that skips it fails here rather than racing.
 */
async function writeWhileSlugHeld<Result>(
  db: Database,
  slug: string,
  write: () => Promise<Result>,
  hold: (tx: Transaction) => Promise<unknown> = async () => {},
): Promise<Result> {
  // Wrapped, or the transaction would await the write that is waiting for it to commit.
  const { pending } = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${SLUG_LOCK_NAMESPACE}, hashtext(${slug}))`);
    await hold(tx);
    const pending = write();
    await expect.poll(() => slugLockWaiters(db)).toBe(1);
    return { pending };
  });

  return pending;
}

describe('createIndicatorDraft', () => {
  repositoryTest('mints an identity with a short id and one draft version', async ({ db }) => {
    const created = await newDraft(db, 'A brand new indicator');

    const [identity] = await db
      .select()
      .from(indicator)
      .where(eq(indicator.id, created.indicatorId));
    const versions = await db
      .select()
      .from(indicatorVersion)
      .where(eq(indicatorVersion.indicatorId, created.indicatorId));

    expect(identity?.shortId).toBe(created.shortId);
    expect(identity?.teamId).toBe(TEAM_IDS.teamA);
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      id: created.versionId,
      status: 'draft',
      name: 'A brand new indicator',
      slug: 'a-brand-new-indicator',
      createdBy: ACTOR,
      updatedBy: ACTOR,
    });
  });

  repositoryTest('puts the indicator in the team it is given', async ({ db }) => {
    const created = await createIndicatorDraft(
      db,
      { name: 'A Team B indicator' },
      AS_ACTOR,
      TEAM_IDS.teamB,
    );
    if (!created.ok) throw new Error('createIndicatorDraft refused the name');

    const [identity] = await db
      .select({ teamId: indicator.teamId })
      .from(indicator)
      .where(eq(indicator.id, created.indicatorId));

    expect(identity?.teamId).toBe(TEAM_IDS.teamB);
  });

  repositoryTest('refuses a name whose slug another indicator already holds', async ({ db }) => {
    await newDraft(db, 'A contested name');

    await expect(
      createIndicatorDraft(db, { name: 'A contested name' }, AS_ACTOR, TEAM_IDS.teamA),
    ).resolves.toEqual({
      ok: false,
      reason: 'slug_taken',
    });
  });

  repositoryTest('waits for another writer of the slug, then creates', async ({ db }) => {
    const result = await writeWhileSlugHeld(db, 'a-held-name', () =>
      createIndicatorDraft(db, { name: 'A held name' }, AS_ACTOR, TEAM_IDS.teamA),
    );

    expect(result).toMatchObject({ ok: true });
  });

  repositoryTest('refuses a name whose slug a writer it waited for has taken', async ({ db }) => {
    const result = await writeWhileSlugHeld(
      db,
      'a-name-created-twice',
      () => createIndicatorDraft(db, { name: 'A name created twice' }, AS_ACTOR, TEAM_IDS.teamA),
      async (tx) => {
        const [identity] = await tx.insert(indicator).values({}).returning({ id: indicator.id });
        if (!identity) throw new Error('inserted no indicator');
        await tx.insert(indicatorVersion).values({
          indicatorId: identity.id,
          status: 'draft',
          name: 'A name created twice',
          slug: 'a-name-created-twice',
          createdBy: ACTOR,
          updatedBy: ACTOR,
        });
      },
    );

    expect(result).toEqual({ ok: false, reason: 'slug_taken' });
  });
});

describe('updateIndicatorDraft', () => {
  repositoryTest('rewrites the draft columns and replaces its lists', async ({ db }) => {
    const created = await newDraft(db, 'Before');
    const [topic] = await db.select({ id: schema.topic.id }).from(schema.topic).limit(1);
    const classified = await typeClassification(db);
    if (!topic || !classified) throw new Error('The seed holds no topics or classifications');

    const result = await updateIndicatorDraft(
      db,
      created.indicatorId,
      { name: 'After', definition: 'A definition' },
      { topicIds: [topic.id], classificationIds: { indicator_type: [classified.id] } },
      AS_OTHER_ACTOR,
    );

    expect(result).toEqual({ ok: true });
    const [version] = await db
      .select()
      .from(indicatorVersion)
      .where(eq(indicatorVersion.id, created.versionId));
    expect(version).toMatchObject({
      name: 'After',
      definition: 'A definition',
      createdBy: ACTOR,
      updatedBy: OTHER_ACTOR,
    });
    expect(await storedTopicIdsOf(db, created.versionId)).toEqual([topic.id]);

    await updateIndicatorDraft(db, created.indicatorId, {}, { topicIds: [] }, AS_ACTOR);

    expect(await storedTopicIdsOf(db, created.versionId)).toEqual([]);
  });

  repositoryTest('re-slugs a renamed draft', async ({ db }) => {
    const created = await newDraft(db, 'An early name');

    await updateIndicatorDraft(db, created.indicatorId, { name: 'A later name' }, {}, AS_ACTOR);

    expect(await slugOf(db, created.versionId)).toBe('a-later-name');
  });

  repositoryTest(
    'keeps the published slug on every version when the draft is renamed',
    async ({ db }) => {
      const { indicatorId, currentId, currentSlug } = await indicatorWithTwoPublications(
        db,
        'Renamed after publication',
      );
      const opened = await createDraftFromPublished(db, indicatorId, AS_ACTOR);
      if (!opened.ok) throw new Error('expected a draft');

      await updateIndicatorDraft(db, indicatorId, { name: 'Renamed in the draft' }, {}, AS_ACTOR);

      expect(await slugOf(db, currentId)).toBe(currentSlug);
      expect(await slugOf(db, opened.versionId)).toBe(currentSlug);
      expect(await getIndicatorById(db, indicatorId)).toMatchObject({
        name: 'Renamed in the draft',
        publishedSlug: currentSlug,
      });
    },
  );

  repositoryTest(
    'refuses an unusable name even though a published indicator keeps its slug',
    async ({ db }) => {
      const { indicatorId } = await indicatorWithTwoPublications(db, 'Renamed unusably');
      await createDraftFromPublished(db, indicatorId, AS_ACTOR);

      await expect(
        updateIndicatorDraft(db, indicatorId, { name: '2024' }, {}, AS_ACTOR),
      ).rejects.toThrow('no usable slug');
    },
  );

  repositoryTest("refuses a rename onto another indicator's slug", async ({ db }) => {
    await newDraft(db, 'An occupied name');
    const created = await newDraft(db, 'A free name');

    await expect(
      updateIndicatorDraft(db, created.indicatorId, { name: 'An occupied name' }, {}, AS_ACTOR),
    ).resolves.toEqual({ ok: false, reason: 'slug_taken' });
  });

  repositoryTest(
    'refuses a rename onto a slug a writer it waited for has taken',
    async ({ db }) => {
      const first = await newDraft(db, 'First of two renames');
      const second = await newDraft(db, 'Second of two renames');

      const result = await writeWhileSlugHeld(
        db,
        'a-name-both-want',
        () =>
          updateIndicatorDraft(db, second.indicatorId, { name: 'A name both want' }, {}, AS_ACTOR),
        (tx) =>
          tx
            .update(indicatorVersion)
            .set({ name: 'A name both want', slug: 'a-name-both-want' })
            .where(eq(indicatorVersion.id, first.versionId)),
      );

      expect(result).toEqual({ ok: false, reason: 'slug_taken' });
    },
  );

  // Two renames swapping slugs each wait on the other's exclusion check unless the slug a
  // rename leaves is held as well as the one it takes.
  repositoryTest('waits for another writer of the slug it leaves, then renames', async ({ db }) => {
    const created = await newDraft(db, 'A name being left');

    const result = await writeWhileSlugHeld(db, 'a-name-being-left', () =>
      updateIndicatorDraft(db, created.indicatorId, { name: 'A name moved to' }, {}, AS_ACTOR),
    );

    expect(result).toEqual({ ok: true });
    expect(await slugOf(db, created.versionId)).toBe('a-name-moved-to');
  });

  repositoryTest('holds all ages', async ({ db }) => {
    const created = await newDraft(db, 'All ages');

    await updateIndicatorDraft(db, created.indicatorId, { ageType: 'all' }, {}, AS_ACTOR);

    expect((await getIndicatorDraftState(db, created.indicatorId))?.draft?.ageType).toBe('all');
  });

  repositoryTest.for<[string, IndicatorDraftAttributes]>([
    ['no sexes', { sexes: [] }],
    // As a caller the types do not bind could send.
    ['a sex outside the vocabulary', { sexes: ['everyone' as never] }],
    ['a specific age without its unit', { ageType: 'specific', specificAge: 5 }],
    [
      'a specific age beside another age type',
      { ageType: 'other', specificAge: 5, specificAgeUnit: 'years' },
    ],
    ['other ages beside another age type', { ageType: 'range', ageDetail: 'Year 6' }],
    // The contract requires the age or the detail each age type asks for.
    ['a specific age type without its age', { ageType: 'specific' }],
    ['other ages without their detail', { ageType: 'other' }],
    [
      'a specific age beside all ages',
      { ageType: 'all', specificAge: 5, specificAgeUnit: 'years' },
    ],
    [
      'a specific age above the highest',
      { ageType: 'specific', specificAge: MAX_AGE + 1, specificAgeUnit: 'years' },
    ],
  ])('refuses %s', async ([name, attributes], { db }) => {
    const created = await newDraft(db, `Refuses ${name}`);

    await expect(
      updateIndicatorDraft(db, created.indicatorId, attributes, {}, AS_ACTOR),
    ).rejects.toThrow();
  });

  repositoryTest(
    "writes a section's answers to the draft alone, leaving its name and slug",
    async ({ db }) => {
      const { indicatorId, currentId, currentName, currentSlug } =
        await indicatorWithTwoPublications(db, 'Answered in a new draft');
      const opened = await createDraftFromPublished(db, indicatorId, AS_ACTOR);
      if (!opened.ok) throw new Error('expected a draft');
      const [published] = await db
        .select()
        .from(indicatorVersion)
        .where(eq(indicatorVersion.id, currentId));

      const result = await updateIndicatorDraft(
        db,
        indicatorId,
        { definition: 'A new definition', rationale: 'A new rationale' },
        {},
        AS_OTHER_ACTOR,
      );

      expect(result).toEqual({ ok: true });
      const state = await getIndicatorDraftState(db, indicatorId);
      expect(state?.draft).toMatchObject({
        name: currentName,
        slug: currentSlug,
        definition: 'A new definition',
        rationale: 'A new rationale',
        updatedBy: OTHER_ACTOR,
      });
      const [after] = await db
        .select()
        .from(indicatorVersion)
        .where(eq(indicatorVersion.id, currentId));
      expect(after).toEqual(published);
    },
  );

  repositoryTest(
    'writes who calculated the indicator, and clears the other organisations on request',
    async ({ db }) => {
      const created = await newDraft(db, 'Calculated by others');

      await updateIndicatorDraft(
        db,
        created.indicatorId,
        { methodology: 'A method', calculatedBy: 'other', calculatedByDetail: 'ONS' },
        {},
        AS_ACTOR,
      );
      const asOther = await getIndicatorDraftState(db, created.indicatorId);
      await updateIndicatorDraft(
        db,
        created.indicatorId,
        { calculatedBy: 'dhsc', calculatedByDetail: null },
        {},
        AS_ACTOR,
      );
      const asDhsc = await getIndicatorDraftState(db, created.indicatorId);

      expect(asOther?.draft).toMatchObject({
        methodology: 'A method',
        calculatedBy: 'other',
        calculatedByDetail: 'ONS',
      });
      expect(asDhsc?.draft).toMatchObject({
        methodology: 'A method',
        calculatedBy: 'dhsc',
        calculatedByDetail: null,
      });
    },
  );

  repositoryTest('writes the confidence interval answers to the draft', async ({ db }) => {
    const created = await newDraft(db, 'Confidence intervals answered');
    const methodId = await ciMethodId(db, "Byar's method");

    const result = await updateIndicatorDraft(
      db,
      created.indicatorId,
      {
        ciMethodId: methodId,
        hasCiMethodModifications: true,
        ciMethodModificationsDetail: 'Adjusted for clustering',
        ciMethodDetail: null,
      },
      {},
      AS_ACTOR,
    );

    expect(result).toEqual({ ok: true });
    const state = await getIndicatorDraftState(db, created.indicatorId);
    expect(state?.draft).toMatchObject({
      ciMethodId: methodId,
      hasCiMethodModifications: true,
      ciMethodModificationsDetail: 'Adjusted for clustering',
      ciMethodDetail: null,
    });
  });

  repositoryTest.for<[string, IndicatorDraftAttributes]>([
    [
      'the other notes and caveats answers',
      {
        disclosureControl: 'yes',
        disclosureControlDetail: 'Counts under 5 are suppressed.',
        hasRounding: false,
        roundingDetail: null,
        hasCaveats: true,
        caveatsDetail: 'Survey data.',
        hasOtherNotes: false,
        otherNotesDetail: null,
      },
    ],
    [
      'the variance and quality notes',
      {
        variation: 'Varies with the age structure of each area.',
        qualityAssurance: 'Checked against the published ONS figures.',
        hasSourceDataIssues: true,
        sourceDataIssuesDetail: 'Late returns from two areas.',
      },
    ],
    [
      'the justifications',
      {
        ciMethodJustification: 'The standard method for rates.',
        dataSourcesJustification: 'The only national source.',
        inequalitiesIncluded: 'Deprivation deciles.',
        hasExclusions: true,
        exclusionsDetail: 'Areas with fewer than 5 deaths.',
        hasAutomation: false,
        automationDetail: null,
      },
    ],
    [
      'the other comments',
      {
        sponsorsAndStakeholders: 'The national screening committee.',
        hasReviewerComments: true,
        reviewerCommentsDetail: 'Replaces indicator 108.',
      },
    ],
    [
      'the copyright and data re-use terms',
      {
        hasCustomCopyright: true,
        customCopyrightDetail: 'Copyright © NHS England',
        hasCustomDataReuse: false,
        customDataReuseDetail: null,
      },
    ],
    [
      'a goal, its values as they were given',
      {
        hasGoalBenchmark: true,
        goalLowerValue: 0.956000001,
        goalUpperValue: 1.161000001,
        goalPolarity: 'lower-is-better',
        goalPolicyDetail: 'Below the England value for 2013/14.',
      },
    ],
  ])('writes %s to the draft', async ([answers, attributes], { db }) => {
    const created = await newDraft(db, `Answered with ${answers}`);

    const result = await updateIndicatorDraft(db, created.indicatorId, attributes, {}, AS_ACTOR);

    expect(result).toEqual({ ok: true });
    const state = await getIndicatorDraftState(db, created.indicatorId);
    expect(state?.draft).toMatchObject(attributes);
  });

  repositoryTest(
    'writes whether there are data quality issues, replacing the answer before',
    async ({ db }) => {
      const created = await newDraft(db, 'Data quality answered');

      await updateIndicatorDraft(
        db,
        created.indicatorId,
        { hasDataQualityIssues: true },
        {},
        AS_ACTOR,
      );
      const yes = await getIndicatorDraftState(db, created.indicatorId);
      await updateIndicatorDraft(
        db,
        created.indicatorId,
        { hasDataQualityIssues: false },
        {},
        AS_ACTOR,
      );
      const no = await getIndicatorDraftState(db, created.indicatorId);

      expect(yes?.draft?.hasDataQualityIssues).toBe(true);
      expect(no?.draft?.hasDataQualityIssues).toBe(false);
    },
  );

  repositoryTest('refuses an indicator with no draft', async ({ db }) => {
    const created = await newDraft(db, 'Draftless');
    await db.delete(indicatorVersion).where(eq(indicatorVersion.indicatorId, created.indicatorId));

    await expect(updateIndicatorDraft(db, created.indicatorId, {}, {}, AS_ACTOR)).resolves.toEqual({
      ok: false,
      reason: 'no_draft',
    });
  });
});

describe('updateIndicatorDraft given the version a form was shown', () => {
  // Versions as a form that edits only the definition would compute them.
  const versionOf = (draft: IndicatorDraft) => editVersion({ definition: draft.definition });
  const shown = editVersion({ definition: null });

  async function definitionOf(db: Database, versionId: string) {
    const [row] = await db
      .select({ definition: indicatorVersion.definition })
      .from(indicatorVersion)
      .where(eq(indicatorVersion.id, versionId));
    return row?.definition;
  }

  repositoryTest('saves a draft whose version is the one shown', async ({ db }) => {
    const created = await newDraft(db, 'Saved as shown');

    const result = await updateIndicatorDraft(
      db,
      created.indicatorId,
      { definition: 'Saved' },
      {},
      AS_ACTOR,
      { version: shown, versionOf },
    );

    expect(result).toEqual({ ok: true });
    expect(await definitionOf(db, created.versionId)).toBe('Saved');
  });

  repositoryTest(
    'refuses a save of a draft changed since, writing nothing and answering its version now',
    async ({ db }) => {
      const created = await newDraft(db, 'Changed since shown');
      await updateIndicatorDraft(db, created.indicatorId, { definition: 'First' }, {}, AS_ACTOR, {
        version: shown,
        versionOf,
      });

      const result = await updateIndicatorDraft(
        db,
        created.indicatorId,
        { definition: 'Second' },
        {},
        AS_OTHER_ACTOR,
        { version: shown, versionOf },
      );

      expect(result).toEqual({
        ok: false,
        reason: 'changed',
        version: editVersion({ definition: 'First' }),
      });
      expect(await definitionOf(db, created.versionId)).toBe('First');
      expect(await auditEntriesFor(db, created.indicatorId)).toHaveLength(2);
    },
  );

  repositoryTest('saves when only what the version does not cover has changed', async ({ db }) => {
    const created = await newDraft(db, 'Changed elsewhere');
    await updateIndicatorDraft(db, created.indicatorId, { rationale: 'Elsewhere' }, {}, AS_ACTOR);

    const result = await updateIndicatorDraft(
      db,
      created.indicatorId,
      { definition: 'Saved' },
      {},
      AS_OTHER_ACTOR,
      { version: shown, versionOf },
    );

    expect(result).toEqual({ ok: true });
  });

  repositoryTest("takes the version from the draft's lists too", async ({ db }) => {
    const created = await newDraft(db, 'Lists changed since');
    const linksVersion = (draft: IndicatorDraft) => editVersion(draft.links);
    await updateIndicatorDraft(
      db,
      created.indicatorId,
      {},
      { links: [{ url: 'https://example.org/', text: 'Example' }] },
      AS_ACTOR,
    );

    const result = await updateIndicatorDraft(
      db,
      created.indicatorId,
      {},
      { links: [] },
      AS_ACTOR,
      {
        version: editVersion([]),
        versionOf: linksVersion,
      },
    );

    expect(result).toMatchObject({ ok: false, reason: 'changed' });
  });

  repositoryTest(
    'refuses a save that waited on another save of the version shown to both',
    async ({ db }) => {
      const created = await newDraft(db, 'Two saves at once');

      // Returned in an object so the transaction doesn't wait for the save, which is itself
      // waiting for the transaction to commit.
      const { waiting } = await db.transaction(async (tx) => {
        await tx
          .update(indicatorVersion)
          .set({ definition: 'First' })
          .where(eq(indicatorVersion.id, created.versionId));
        const waiting = updateIndicatorDraft(
          db,
          created.indicatorId,
          { definition: 'Second' },
          {},
          AS_OTHER_ACTOR,
          { version: shown, versionOf },
        );
        await lockWaited(db);
        return { waiting };
      });

      expect(await waiting).toMatchObject({ ok: false, reason: 'changed' });
      expect(await definitionOf(db, created.versionId)).toBe('First');
    },
  );
});

describe('the audit log of draft writes', () => {
  repositoryTest('records a new draft with its version id and team', async ({ db }) => {
    const created = await newDraft(db, 'Audited new draft');

    const [entry] = await auditEntriesFor(db, created.indicatorId);
    expect(entry).toMatchObject({
      actorId: ACTOR,
      action: 'indicator.draft_created',
      entityType: 'indicator',
      requestId: null,
    });
    expect(entry?.changes).toMatchObject({
      id: { before: null, after: created.versionId },
      indicatorId: { before: null, after: created.indicatorId },
      name: { before: null, after: 'Audited new draft' },
      slug: { before: null, after: 'audited-new-draft' },
      status: { before: null, after: 'draft' },
      teamId: { before: null, after: TEAM_IDS.teamA },
    });
  });

  repositoryTest('records only the columns a save changed', async ({ db }) => {
    const created = await newDraft(db, 'Audited rename');

    await updateIndicatorDraft(
      db,
      created.indicatorId,
      { name: 'Audited renamed' },
      {},
      AS_OTHER_ACTOR,
    );

    const [, entry] = await auditEntriesFor(db, created.indicatorId);
    expect(entry).toEqual({
      actorId: OTHER_ACTOR,
      action: 'indicator.draft_updated',
      entityType: 'indicator',
      requestId: null,
      changes: {
        name: { before: 'Audited rename', after: 'Audited renamed' },
        slug: { before: 'audited-rename', after: 'audited-renamed' },
      },
    });
  });

  repositoryTest('records a replaced list whole, before and after', async ({ db }) => {
    const created = await newDraft(db, 'Audited links');
    const first = [{ url: 'https://example.com/a', text: 'A' }];
    const second = [{ url: 'https://example.com/b', text: 'B' }, ...first];

    await updateIndicatorDraft(
      db,
      created.indicatorId,
      { hasLinks: true },
      { links: first },
      AS_ACTOR,
    );
    await updateIndicatorDraft(db, created.indicatorId, {}, { links: second }, AS_ACTOR);

    const [, withLinks, replaced] = await auditEntriesFor(db, created.indicatorId);
    expect(withLinks?.changes).toEqual({
      hasLinks: { before: null, after: true },
      links: { before: [], after: first },
    });
    expect(replaced?.changes).toEqual({ links: { before: first, after: second } });
  });

  repositoryTest('records nothing for a save that changes nothing', async ({ db }) => {
    const created = await newDraft(db, 'Audited no-op');
    const topics = await db.select({ id: schema.topic.id }).from(schema.topic).limit(2);
    const topicIds = topics.map(({ id }) => id);

    await updateIndicatorDraft(db, created.indicatorId, {}, { topicIds }, AS_ACTOR);
    await updateIndicatorDraft(
      db,
      created.indicatorId,
      { name: 'Audited no-op' },
      { topicIds: [...topicIds].reverse() },
      AS_ACTOR,
    );

    expect((await auditEntriesFor(db, created.indicatorId)).map(({ action }) => action)).toEqual([
      'indicator.draft_created',
      'indicator.draft_updated',
    ]);
  });

  repositoryTest(
    'records as removed only the list rows the save itself removed',
    async ({ db }) => {
      const created = await newDraft(db, 'Audited concurrent unlink');
      const topics = await db.select({ id: schema.topic.id }).from(schema.topic).limit(2);
      const [gone, kept] = topics.map(({ id }) => id);
      if (gone === undefined || kept === undefined) throw new Error('the seed has too few topics');
      await updateIndicatorDraft(db, created.indicatorId, {}, { topicIds: [gone, kept] }, AS_ACTOR);

      // Another writer removes a link, as a topic's deletion does, and holds it while the save runs.
      const { saving } = await db.transaction(async (tx) => {
        await tx
          .delete(schema.indicatorVersionTopic)
          .where(eq(schema.indicatorVersionTopic.topicId, gone));
        const saving = updateIndicatorDraft(
          db,
          created.indicatorId,
          {},
          { topicIds: [kept] },
          AS_ACTOR,
        );
        await expect.poll(() => lockWaiters(db)).toBe(1);
        return { saving };
      });
      await saving;

      expect((await auditEntriesFor(db, created.indicatorId)).map(({ action }) => action)).toEqual([
        'indicator.draft_created',
        'indicator.draft_updated',
      ]);
    },
  );

  repositoryTest('records nothing for an indicator without a draft', async ({ db }) => {
    const unknown = '00000000-0000-7000-8000-0000000000fe';

    await updateIndicatorDraft(db, unknown, { name: 'Nobody' }, {}, AS_ACTOR);

    expect(await auditEntriesFor(db, unknown)).toEqual([]);
  });

  repositoryTest(
    'records a draft opened from the published version, lists and all',
    async ({ db }) => {
      const created = await newDraft(db, 'Audited reopened');
      const first = [{ url: 'https://example.com/a', text: 'A' }];
      await updateIndicatorDraft(
        db,
        created.indicatorId,
        { hasLinks: true },
        { links: first },
        AS_ACTOR,
      );
      await db
        .update(indicatorVersion)
        .set({ status: 'published', publishedAt: new Date() })
        .where(eq(indicatorVersion.id, created.versionId));

      const opened = await createDraftFromPublished(db, created.indicatorId, AS_OTHER_ACTOR);
      if (!opened.ok) throw new Error('opened no draft');

      const entry = (await auditEntriesFor(db, created.indicatorId)).at(-1);
      expect(entry).toMatchObject({
        actorId: OTHER_ACTOR,
        action: 'indicator.draft_created_from_published',
      });
      expect(entry?.changes).toMatchObject({
        id: { before: null, after: opened.versionId },
        name: { before: null, after: 'Audited reopened' },
        hasLinks: { before: null, after: true },
        links: { before: [], after: first },
      });
    },
  );
});

describe('getIndicatorPublishedVersion', () => {
  repositoryTest(
    'reads the current published version, as a section reads a draft',
    async ({ db }) => {
      const published = await indicatorWithTwoPublications(db, 'Published and annotated');
      await db
        .update(indicatorVersion)
        .set({ variation: 'Little.' })
        .where(eq(indicatorVersion.id, published.currentId));

      const version = await getIndicatorPublishedVersion(db, published.indicatorId);

      expect(version).toMatchObject({
        id: published.currentId,
        name: published.currentName,
        variation: 'Little.',
        links: [],
      });
    },
  );

  repositoryTest('still reads it while a draft revises it', async ({ db }) => {
    const published = await indicatorWithTwoPublications(db, 'Published and revised');
    await createDraftFromPublished(db, published.indicatorId, AS_ACTOR);

    const version = await getIndicatorPublishedVersion(db, published.indicatorId);

    expect(version?.id).toBe(published.currentId);
  });

  repositoryTest('reads nothing for an indicator never published', async ({ db }) => {
    const created = await newDraft(db, 'Never published');

    expect(await getIndicatorPublishedVersion(db, created.indicatorId)).toBeUndefined();
  });
});

describe('getIndicatorDraftState', () => {
  repositoryTest(
    'reads the draft of an indicator that has never been published',
    async ({ db }) => {
      const created = await newDraft(db, 'A draft awaiting its first publication');

      const state = await getIndicatorDraftState(db, created.indicatorId);

      expect(state?.id).toBe(created.indicatorId);
      expect(state?.shortId).toBe(created.shortId);
      expect(state?.draft?.name).toBe('A draft awaiting its first publication');
      expect(state).toMatchObject({ indicatorStatus: 'new', draftStatus: 'draft' });
    },
  );

  repositoryTest('reports the published version behind a draft being revised', async ({ db }) => {
    const published = await indicatorWithTwoPublications(db, 'Being revised');
    await createDraftFromPublished(db, published.indicatorId, AS_ACTOR);

    const state = await getIndicatorDraftState(db, published.indicatorId);

    expect(state?.draft?.name).toBe(published.currentName);
    expect(state).toMatchObject({ indicatorStatus: 'live', draftStatus: 'draft' });
  });

  repositoryTest('reports no draft for a published indicator nobody is editing', async ({ db }) => {
    const published = await indicatorWithTwoPublications(db, 'Nobody editing');

    const state = await getIndicatorDraftState(db, published.indicatorId);

    expect(state?.draft).toBeNull();
    expect(state).toMatchObject({ indicatorStatus: 'live', draftStatus: null });
  });

  repositoryTest(
    "reports the kind of the draft's CI method, and none before one is chosen",
    async ({ db }) => {
      const created = await newDraft(db, 'A draft choosing its CI method');

      const before = await getIndicatorDraftState(db, created.indicatorId);
      await updateIndicatorDraft(
        db,
        created.indicatorId,
        { ciMethodId: await ciMethodId(db, 'No confidence intervals available') },
        {},
        AS_ACTOR,
      );
      const after = await getIndicatorDraftState(db, created.indicatorId);

      expect(before?.draftCiMethodKind).toBeNull();
      expect(after?.draftCiMethodKind).toBe('none');
    },
  );

  repositoryTest('reads the scheduled publication as it was written', async ({ db }) => {
    const created = await newDraft(db, 'A draft with a publishing date');

    const before = await getIndicatorDraftState(db, created.indicatorId);
    await updateIndicatorDraft(
      db,
      created.indicatorId,
      { scheduledPublishAt: new Date('2027-09-14T08:30:00.000Z') },
      {},
      AS_ACTOR,
    );
    const after = await getIndicatorDraftState(db, created.indicatorId);

    expect(before?.draft?.scheduledPublishAt).toBeNull();
    expect(after?.draft?.scheduledPublishAt).toEqual(new Date('2027-09-14T08:30:00.000Z'));
  });

  repositoryTest(
    "reads the indicator's team and where the draft's latest submission stands",
    async ({ db }) => {
      const created = await newDraft(db, 'A draft submitted for approval');
      const before = await getIndicatorDraftState(db, created.indicatorId);
      const submitted = await submitIndicator(
        db,
        created.indicatorId,
        await completeDraft(db, created),
        AS_ACTOR,
      );
      const after = await getIndicatorDraftState(db, created.indicatorId);

      expect(submitted).toEqual({ ok: true });
      expect(before).toMatchObject({ teamId: TEAM_IDS.teamA, draftSubmissionStatus: null });
      expect(after).toMatchObject({ teamId: TEAM_IDS.teamA, draftSubmissionStatus: 'submitted' });
      expect(after?.draft?.isLocked).toBe(true);
    },
  );

  repositoryTest('finds nothing for an indicator that does not exist', async ({ db }) => {
    await expect(
      getIndicatorDraftState(db, '00000000-0000-7000-8000-000000000000'),
    ).resolves.toBeUndefined();
  });
});
