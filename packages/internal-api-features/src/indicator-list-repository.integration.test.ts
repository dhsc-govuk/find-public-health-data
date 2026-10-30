import { FAKE_USER_IDS, TEAM_IDS } from '@fphd/auth';
import type { IndicatorListScope } from '@fphd/auth/permissions';
import { type Database, listIndicatorFacets, schema } from '@fphd/db';
import { and, eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import { updateIndicatorDraft } from './indicator-draft-repository.ts';
import {
  getIndicatorById,
  listIndicatorsPage,
  listIndicatorsToReview,
  listIndicatorsUnderReview,
} from './indicator-list-repository.ts';
import { createDraftFromPublished } from './indicator-publish-repository.ts';
import {
  ACTOR,
  AS_ACTOR,
  AS_OTHER_ACTOR,
  idsNewestFirst,
  indicatorWithTwoPublications,
  newDraft,
  OTHER_ACTOR,
  repositoryTest,
} from './indicator-repository.testing.ts';
import { completeDraft } from './indicator-workflow.testing.ts';
import {
  assignReviewers,
  submitIndicator,
  withdrawSubmission,
} from './indicator-workflow-repository.ts';

const EVERY_INDICATOR = { all: true } as const;

describe('listIndicatorsPage', () => {
  repositoryTest('pages through every indicator, most recently edited first', async ({ db }) => {
    const expected = await idsNewestFirst(db);
    const pageSize = Math.ceil(expected.length / 2);

    const first = await listIndicatorsPage(db, 1, pageSize, EVERY_INDICATOR);
    const second = await listIndicatorsPage(db, 2, pageSize, EVERY_INDICATOR);

    expect(first.total).toBe(expected.length);
    expect(second.total).toBe(expected.length);
    expect([...first.indicators, ...second.indicators].map((row) => row.id)).toEqual(expected);
    // The API serialises this, so a driver string rather than a Date is a 500.
    expect(first.indicators[0]?.updatedAt).toBeInstanceOf(Date);
  });

  repositoryTest(
    'returns an empty page past the end, still reporting the total',
    async ({ db }) => {
      const expected = await idsNewestFirst(db);

      const page = await listIndicatorsPage(db, 2, expected.length, EVERY_INDICATOR);

      expect(page.indicators).toEqual([]);
      expect(page.total).toBe(expected.length);
    },
  );

  repositoryTest(
    'includes an indicator with no published version, which the public listing hides',
    async ({ db }) => {
      const created = await newDraft(db, 'A draft-only indicator');

      const page = await listIndicatorsPage(db, 1, 1, EVERY_INDICATOR);

      expect(page.indicators[0]).toMatchObject({
        id: created.indicatorId,
        name: 'A draft-only indicator',
      });
    },
  );
});

describe('listIndicatorsPage within teams', () => {
  repositoryTest("lists and counts only the given teams' indicators", async ({ db }) => {
    const created = await newDraft(db, 'A Team B indicator');
    await db
      .update(schema.indicator)
      .set({ teamId: TEAM_IDS.teamB })
      .where(eq(schema.indicator.id, created.indicatorId));

    const page = await listIndicatorsPage(db, 1, 10, { all: false, teamIds: [TEAM_IDS.teamB] });

    expect(page.indicators.map((row) => row.id)).toEqual([created.indicatorId]);
    expect(page.indicators[0]?.teamId).toBe(TEAM_IDS.teamB);
    expect(page.total).toBe(1);
  });

  repositoryTest('lists nothing for a scope of no teams', async ({ db }) => {
    await expect(listIndicatorsPage(db, 1, 10, { all: false, teamIds: [] })).resolves.toEqual({
      indicators: [],
      total: 0,
    });
  });
});

describe('the names on each row', () => {
  async function listed(db: Database, id: string) {
    const all = (await idsNewestFirst(db)).length;
    const page = await listIndicatorsPage(db, 1, all, EVERY_INDICATOR);
    return page.indicators.find((row) => row.id === id);
  }

  async function displayName(db: Database, id: string) {
    const [user] = await db
      .select({ name: schema.appUser.displayName })
      .from(schema.appUser)
      .where(eq(schema.appUser.id, id));
    return user?.name;
  }

  repositoryTest(
    'names the team, who wrote the first version and who edited the draft last',
    async ({ db }) => {
      const created = await newDraft(db, 'Named on the dashboard');
      await updateIndicatorDraft(
        db,
        created.indicatorId,
        { definition: 'Edited' },
        {},
        AS_OTHER_ACTOR,
      );

      expect(await listed(db, created.indicatorId)).toMatchObject({
        teamName: 'Team A',
        createdBy: await displayName(db, ACTOR),
        lastEditedBy: await displayName(db, OTHER_ACTOR),
      });
    },
  );

  repositoryTest(
    "keeps the first version's writer as the creator of a live indicator with a new draft",
    async ({ db }) => {
      const { indicatorId, supersededId } = await indicatorWithTwoPublications(
        db,
        'Live, redrafted',
      );
      // A later version by someone else is not the indicator's creation.
      await db
        .update(schema.indicatorVersion)
        .set({ createdBy: OTHER_ACTOR })
        .where(eq(schema.indicatorVersion.id, supersededId));
      await createDraftFromPublished(db, indicatorId, AS_OTHER_ACTOR);

      expect((await listed(db, indicatorId))?.createdBy).toBe(await displayName(db, ACTOR));
    },
  );

  repositoryTest("names the published version's editor while there is no draft", async ({ db }) => {
    const { indicatorId, currentId } = await indicatorWithTwoPublications(db, 'Live, edited');
    await db
      .update(schema.indicatorVersion)
      .set({ updatedBy: OTHER_ACTOR })
      .where(eq(schema.indicatorVersion.id, currentId));

    expect(await listed(db, indicatorId)).toMatchObject({
      lastEditedBy: await displayName(db, OTHER_ACTOR),
    });
  });

  repositoryTest('leaves the team empty for an indicator in no team', async ({ db }) => {
    const created = await newDraft(db, 'In no team');
    await db
      .update(schema.indicator)
      .set({ teamId: null })
      .where(eq(schema.indicator.id, created.indicatorId));

    expect(await listed(db, created.indicatorId)).toMatchObject({ teamName: null });
  });
});

describe('the derived statuses', () => {
  /** The whole listing, so a case finds its own row wherever the order put it. */
  async function listed(db: Database, id: string) {
    const all = (await idsNewestFirst(db)).length;
    const page = await listIndicatorsPage(db, 1, all, EVERY_INDICATOR);
    return page.indicators.find((row) => row.id === id);
  }

  repositoryTest('reads a draft with nothing published as new and unsubmitted', async ({ db }) => {
    const created = await newDraft(db, 'A first draft');
    const statuses = {
      indicatorStatus: 'new',
      draftStatus: 'draft',
      draftLocked: false,
      draftSubmissionStatus: null,
      draftReviewers: [],
    };

    expect(await listed(db, created.indicatorId)).toMatchObject(statuses);
    expect(await getIndicatorById(db, created.indicatorId)).toMatchObject(statuses);
  });

  repositoryTest(
    'reads a published indicator with no draft as live and nothing in flight',
    async ({ db }) => {
      const { indicatorId } = await indicatorWithTwoPublications(db, 'Live with no draft');
      const statuses = {
        indicatorStatus: 'live',
        draftStatus: null,
        draftLocked: false,
        draftSubmissionStatus: null,
        draftReviewers: [],
      };

      expect(await listed(db, indicatorId)).toMatchObject(statuses);
      expect(await getIndicatorById(db, indicatorId)).toMatchObject(statuses);
    },
  );

  repositoryTest(
    'reads a draft of a published indicator as live with an unsubmitted draft',
    async ({ db }) => {
      const { indicatorId } = await indicatorWithTwoPublications(db, 'Live with a draft');
      await createDraftFromPublished(db, indicatorId, AS_ACTOR);
      const statuses = { indicatorStatus: 'live', draftStatus: 'draft' };

      expect(await listed(db, indicatorId)).toMatchObject(statuses);
      expect(await getIndicatorById(db, indicatorId)).toMatchObject(statuses);
    },
  );

  repositoryTest('reads a submitted draft as locked under its submission', async ({ db }) => {
    const created = await newDraft(db, 'A submitted draft');
    await submitIndicator(db, created.indicatorId, await completeDraft(db, created), AS_ACTOR);
    const statuses = {
      draftStatus: 'draft',
      draftLocked: true,
      draftSubmissionStatus: 'submitted',
    };

    expect(await listed(db, created.indicatorId)).toMatchObject(statuses);
    expect(await getIndicatorById(db, created.indicatorId)).toMatchObject(statuses);
  });

  repositoryTest('reads a withdrawn draft as unlocked', async ({ db }) => {
    const created = await newDraft(db, 'A withdrawn draft');
    await submitIndicator(db, created.indicatorId, await completeDraft(db, created), AS_ACTOR);
    await withdrawSubmission(db, created.indicatorId, 1, AS_ACTOR);
    const statuses = { draftLocked: false, draftSubmissionStatus: 'withdrawn' };

    expect(await listed(db, created.indicatorId)).toMatchObject(statuses);
    expect(await getIndicatorById(db, created.indicatorId)).toMatchObject(statuses);
  });

  repositoryTest('reads the latest submission of a draft submitted again', async ({ db }) => {
    const created = await newDraft(db, 'A resubmitted draft');
    const shown = await completeDraft(db, created);
    await submitIndicator(db, created.indicatorId, shown, AS_ACTOR);
    await withdrawSubmission(db, created.indicatorId, 1, AS_ACTOR);
    await submitIndicator(db, created.indicatorId, shown, AS_ACTOR);

    expect(await getIndicatorById(db, created.indicatorId)).toMatchObject({
      draftLocked: true,
      draftSubmissionStatus: 'submitted',
    });
  });

  repositoryTest('reads a draft in review with its reviewers by name', async ({ db }) => {
    const created = await newDraft(db, 'A draft in review');
    await submitIndicator(db, created.indicatorId, await completeDraft(db, created), AS_ACTOR);
    await assignReviewers(
      db,
      created.indicatorId,
      {
        submissionNumber: 1,
        previousReviewerIds: [],
        reviewerIds: [FAKE_USER_IDS.publisherAndReviewer, FAKE_USER_IDS.imrgReviewer],
      },
      { userId: FAKE_USER_IDS.imrgManager, requestId: null },
    );
    const statuses = {
      draftLocked: true,
      draftSubmissionStatus: 'in_review',
      draftReviewers: [
        { id: FAKE_USER_IDS.imrgReviewer, name: 'Jamie Evans' },
        { id: FAKE_USER_IDS.publisherAndReviewer, name: 'Morgan Hughes' },
      ],
    };

    expect(await listed(db, created.indicatorId)).toMatchObject(statuses);
    expect(await getIndicatorById(db, created.indicatorId)).toMatchObject(statuses);
  });
});

const AS_MANAGER = { userId: FAKE_USER_IDS.imrgManager, requestId: null };

async function submitted(db: Database, name: string) {
  const created = await newDraft(db, name);
  await submitIndicator(db, created.indicatorId, await completeDraft(db, created), AS_ACTOR);
  return created.indicatorId;
}

async function assign(
  db: Database,
  indicatorId: string,
  reviewerIds: string[],
  submissionNumber = 1,
) {
  await assignReviewers(
    db,
    indicatorId,
    { submissionNumber, previousReviewerIds: [], reviewerIds },
    AS_MANAGER,
  );
}

describe('listIndicatorsUnderReview', () => {
  /** The ids each table lists, in its order, from among `ids`. */
  async function tables(db: Database, ids: string[], scope: IndicatorListScope = EVERY_INDICATOR) {
    const { unassigned, assigned } = await listIndicatorsUnderReview(db, scope);
    const own = (rows: { id: string }[]) =>
      rows.map((row) => row.id).filter((id) => ids.includes(id));
    return { unassigned: own(unassigned), assigned: own(assigned) };
  }

  repositoryTest(
    'lists drafts waiting for reviewers as unassigned and drafts in review as assigned',
    async ({ db }) => {
      const waiting = await submitted(db, 'Waiting for reviewers');
      const inReview = await submitted(db, 'In review');
      await assign(db, inReview, [FAKE_USER_IDS.imrgReviewer]);
      const unsubmitted = (await newDraft(db, 'Never submitted')).indicatorId;
      const withdrawn = await submitted(db, 'Withdrawn');
      await withdrawSubmission(db, withdrawn, 1, AS_ACTOR);
      const { indicatorId: published } = await indicatorWithTwoPublications(db, 'Published');

      expect(await tables(db, [waiting, inReview, unsubmitted, withdrawn, published])).toEqual({
        unassigned: [waiting],
        assigned: [inReview],
      });
    },
  );

  repositoryTest('names the reviewers of an indicator in review', async ({ db }) => {
    const inReview = await submitted(db, 'In review, named');
    await assign(db, inReview, [FAKE_USER_IDS.publisherAndReviewer, FAKE_USER_IDS.imrgReviewer]);

    const { assigned } = await listIndicatorsUnderReview(db, EVERY_INDICATOR);

    expect(assigned.find((row) => row.id === inReview)).toMatchObject({
      teamName: 'Team A',
      draftReviewers: [
        { id: FAKE_USER_IDS.imrgReviewer, name: 'Jamie Evans' },
        { id: FAKE_USER_IDS.publisherAndReviewer, name: 'Morgan Hughes' },
      ],
    });
  });

  repositoryTest(
    'lists the oldest submission first, whenever it was last edited',
    async ({ db }) => {
      // Created first and edited last, so neither the id nor the last edit puts it second.
      const first = await newDraft(db, 'Created first, edited last, submitted last');
      const second = await newDraft(db, 'Created second, edited first, submitted first');
      const secondShown = await completeDraft(db, second);
      const firstShown = await completeDraft(db, first);
      await submitIndicator(db, second.indicatorId, secondShown, AS_ACTOR);
      await submitIndicator(db, first.indicatorId, firstShown, AS_ACTOR);

      const { unassigned } = await tables(db, [first.indicatorId, second.indicatorId]);

      expect(unassigned).toEqual([second.indicatorId, first.indicatorId]);
    },
  );

  repositoryTest('dates a draft submitted again by its latest submission', async ({ db }) => {
    const resubmitted = await newDraft(db, 'Submitted, withdrawn and submitted again');
    const shown = await completeDraft(db, resubmitted);
    await submitIndicator(db, resubmitted.indicatorId, shown, AS_ACTOR);
    const other = await submitted(db, 'Submitted once, in between');
    await withdrawSubmission(db, resubmitted.indicatorId, 1, AS_ACTOR);
    await submitIndicator(db, resubmitted.indicatorId, shown, AS_ACTOR);

    const { unassigned } = await tables(db, [resubmitted.indicatorId, other]);

    expect(unassigned).toEqual([other, resubmitted.indicatorId]);
  });

  repositoryTest("lists only the given teams' indicators", async ({ db }) => {
    const inTeamA = await submitted(db, 'Under review in Team A');
    const inTeamB = await submitted(db, 'Under review in Team B');
    await db
      .update(schema.indicator)
      .set({ teamId: TEAM_IDS.teamB })
      .where(eq(schema.indicator.id, inTeamB));

    expect(await tables(db, [inTeamA, inTeamB], { all: false, teamIds: [TEAM_IDS.teamB] })).toEqual(
      { unassigned: [inTeamB], assigned: [] },
    );
  });

  repositoryTest('lists nothing for a scope of no teams', async ({ db }) => {
    await submitted(db, 'Under review, out of scope');

    await expect(listIndicatorsUnderReview(db, { all: false, teamIds: [] })).resolves.toEqual({
      unassigned: [],
      assigned: [],
    });
  });
});

describe('listIndicatorsToReview', () => {
  const REVIEWER = FAKE_USER_IDS.imrgReviewer;
  const OTHER_REVIEWER = FAKE_USER_IDS.publisherAndReviewer;

  async function firstSubmissionId(db: Database, indicatorId: string): Promise<string> {
    const [first] = await db
      .select({ id: schema.indicatorVersionSubmission.id })
      .from(schema.indicatorVersionSubmission)
      .where(
        and(
          eq(schema.indicatorVersionSubmission.indicatorId, indicatorId),
          eq(schema.indicatorVersionSubmission.number, 1),
        ),
      );
    if (!first) throw new Error('the indicator has no submission');
    return first.id;
  }

  /** The ids the reviewer's list holds, in its order, from among `ids`. */
  async function listed(db: Database, ids: string[], reviewerId: string = REVIEWER) {
    const rows = await listIndicatorsToReview(db, reviewerId);
    return rows.map((row) => row.id).filter((id) => ids.includes(id));
  }

  repositoryTest(
    'lists the drafts in review that the reviewer is assigned, and no others',
    async ({ db }) => {
      const mine = await submitted(db, 'In review, assigned to the reviewer');
      await assign(db, mine, [REVIEWER, OTHER_REVIEWER]);
      const theirs = await submitted(db, 'In review, assigned to another reviewer');
      await assign(db, theirs, [OTHER_REVIEWER]);
      const waiting = await submitted(db, 'Waiting for reviewers, none assigned yet');
      const withdrawn = await submitted(db, 'Withdrawn before review');
      await withdrawSubmission(db, withdrawn, 1, AS_ACTOR);

      expect(await listed(db, [mine, theirs, waiting, withdrawn])).toEqual([mine]);
      expect(await listed(db, [mine, theirs, waiting, withdrawn], OTHER_REVIEWER)).toEqual([
        mine,
        theirs,
      ]);
    },
  );

  repositoryTest(
    'leaves out a draft whose reviewer was assigned to an earlier submission only',
    async ({ db }) => {
      const created = await newDraft(db, 'Reviewed once, in review again with someone else');
      const shown = await completeDraft(db, created);
      const { indicatorId } = created;
      await submitIndicator(db, indicatorId, shown, AS_ACTOR);
      await withdrawSubmission(db, indicatorId, 1, AS_ACTOR);
      // No step assigns reviewers to a withdrawn submission; it stands in for an earlier round.
      await db.insert(schema.indicatorVersionSubmissionReviewer).values({
        submissionId: await firstSubmissionId(db, indicatorId),
        reviewerId: REVIEWER,
        assignedBy: FAKE_USER_IDS.imrgManager,
      });
      await submitIndicator(db, indicatorId, shown, AS_ACTOR);
      await assign(db, indicatorId, [OTHER_REVIEWER], 2);

      expect(await listed(db, [indicatorId])).toEqual([]);
      expect(await listed(db, [indicatorId], OTHER_REVIEWER)).toEqual([indicatorId]);
    },
  );

  repositoryTest(
    "leaves out a draft whose latest submission has the reviewer's row but is not in review",
    async ({ db }) => {
      const indicatorId = await submitted(db, 'Withdrawn with a reviewer row');
      await withdrawSubmission(db, indicatorId, 1, AS_ACTOR);
      await db.insert(schema.indicatorVersionSubmissionReviewer).values({
        submissionId: await firstSubmissionId(db, indicatorId),
        reviewerId: REVIEWER,
        assignedBy: FAKE_USER_IDS.imrgManager,
      });

      expect(await listed(db, [indicatorId])).toEqual([]);
    },
  );

  repositoryTest('lists the oldest submission first, with its reviewers', async ({ db }) => {
    const first = await newDraft(db, 'Created first, submitted second');
    const second = await newDraft(db, 'Created second, submitted first');
    const firstShown = await completeDraft(db, first);
    const secondShown = await completeDraft(db, second);
    await submitIndicator(db, second.indicatorId, secondShown, AS_ACTOR);
    await submitIndicator(db, first.indicatorId, firstShown, AS_ACTOR);
    await assign(db, first.indicatorId, [REVIEWER]);
    await assign(db, second.indicatorId, [REVIEWER, OTHER_REVIEWER]);

    const rows = await listIndicatorsToReview(db, REVIEWER);
    const own = rows.filter(({ id }) => [first.indicatorId, second.indicatorId].includes(id));

    expect(own.map(({ id }) => id)).toEqual([second.indicatorId, first.indicatorId]);
    expect(own[0]).toMatchObject({
      teamName: 'Team A',
      draftSubmissionStatus: 'in_review',
      draftReviewers: [
        { id: REVIEWER, name: 'Jamie Evans' },
        { id: OTHER_REVIEWER, name: 'Morgan Hughes' },
      ],
    });
  });
});

describe('getIndicatorById', () => {
  repositoryTest(
    'reads an indicator by its row id, with the public number',
    async ({ db, seededIds }) => {
      const target = seededIds[0];
      if (target === undefined) throw new Error('The seed holds no indicators');

      const found = await getIndicatorById(db, target);

      expect(found).toMatchObject({ id: target, indicatorStatus: 'live' });
      expect(found?.updatedAt).toBeInstanceOf(Date);
      expect(found?.shortId).toEqual(expect.any(Number));
      expect(found?.name).not.toBe('');
    },
  );

  repositoryTest(
    'prefers the draft name once a draft version exists',
    async ({ db, seededIds }) => {
      const target = seededIds.at(-1);
      if (target === undefined) throw new Error('The seed holds no indicators');

      await createDraftFromPublished(db, target, AS_ACTOR);
      await updateIndicatorDraft(db, target, { name: 'Edited in a draft' }, {}, AS_ACTOR);

      expect(await getIndicatorById(db, target)).toMatchObject({
        draftStatus: 'draft',
        name: 'Edited in a draft',
      });
    },
  );

  repositoryTest('reads the most recently published version when several exist', async ({ db }) => {
    const { indicatorId, currentId, currentName, currentSlug, supersededId } =
      await indicatorWithTwoPublications(db, 'Published twice');

    const found = await getIndicatorById(db, indicatorId);

    expect(supersededId > currentId).toBe(true);
    expect(found).toMatchObject({
      name: currentName,
      publishedSlug: currentSlug,
    });
    expect(found?.updatedAt.toISOString()).toBe('2030-01-01T00:00:00.000Z');
  });

  repositoryTest('returns nothing for an id no indicator has', async ({ db }) => {
    expect(await getIndicatorById(db, '00000000-0000-7000-8000-000000000000')).toBeUndefined();
  });
});

describe('sharing one connection with the public repositories', () => {
  // internal-api serves both surfaces from one connection, and drizzle keys its column-name
  // cache on the unqualified relation name: the indicator table must not shadow the view.
  repositoryTest(
    'reads the indicator table and the published indicator view in one process',
    async ({ db }) => {
      await listIndicatorsPage(db, 1, 1, EVERY_INDICATOR);

      await expect(listIndicatorFacets(db)).resolves.toMatchObject({
        sources: expect.any(Array),
        valueTypes: expect.any(Array),
      });
    },
  );
});
