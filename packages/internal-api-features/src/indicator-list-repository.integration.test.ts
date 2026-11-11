import { FAKE_USER_IDS, TEAM_IDS } from '@fphd/auth';
import type { IndicatorListScope } from '@fphd/auth/permissions';
import { type Database, listIndicatorFacets, schema } from '@fphd/db';
import { and, eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import type { ReviewResponseKind } from './contract.ts';
import { getIndicatorDraftState, updateIndicatorDraft } from './indicator-draft-repository.ts';
import {
  findIndicatorAccess,
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
  seededRepositoryTest,
} from './indicator-repository.testing.ts';
import { completeDraft, sentBackDraft, ukToday } from './indicator-workflow.testing.ts';
import {
  assignReviewers,
  submitIndicator,
  withdrawSubmission,
} from './indicator-workflow-repository.ts';
import { respondToReview } from './review-response-repository.ts';

const EVERY_INDICATOR = { all: true } as const;

describe('listIndicatorsPage', () => {
  seededRepositoryTest(
    'pages through every indicator, most recently edited first',
    async ({ db }) => {
      const expected = await idsNewestFirst(db);
      const pageSize = Math.ceil(expected.length / 2);

      const first = await listIndicatorsPage(db, 1, pageSize, EVERY_INDICATOR);
      const second = await listIndicatorsPage(db, 2, pageSize, EVERY_INDICATOR);

      expect(first.total).toBe(expected.length);
      expect(second.total).toBe(expected.length);
      expect([...first.indicators, ...second.indicators].map((row) => row.id)).toEqual(expected);
      // The API serialises this, so a driver string rather than a Date is a 500.
      expect(first.indicators[0]?.updatedAt).toBeInstanceOf(Date);
    },
  );

  seededRepositoryTest(
    'returns an empty page past the end, still reporting the total',
    async ({ db }) => {
      const expected = await idsNewestFirst(db);

      const page = await listIndicatorsPage(db, 2, expected.length, EVERY_INDICATOR);

      expect(page.indicators).toEqual([]);
      expect(page.total).toBe(expected.length);
    },
  );

  seededRepositoryTest(
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
  seededRepositoryTest("lists and counts only the given teams' indicators", async ({ db }) => {
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

  seededRepositoryTest('lists nothing for a scope of no teams', async ({ db }) => {
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

  seededRepositoryTest(
    'names the team, who wrote the first version and who edited the draft last',
    async ({ db }) => {
      const created = await newDraft(db, 'Named on the dashboard');
      await updateIndicatorDraft(
        db,
        created.indicatorId,
        'definition-and-rationale',
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

  seededRepositoryTest(
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

  seededRepositoryTest(
    "names the published version's editor while there is no draft",
    async ({ db }) => {
      const { indicatorId, currentId } = await indicatorWithTwoPublications(db, 'Live, edited');
      await db
        .update(schema.indicatorVersion)
        .set({ updatedBy: OTHER_ACTOR })
        .where(eq(schema.indicatorVersion.id, currentId));

      expect(await listed(db, indicatorId)).toMatchObject({
        lastEditedBy: await displayName(db, OTHER_ACTOR),
      });
    },
  );
});

describe('the derived statuses', () => {
  /** The whole listing, so a case finds its own row wherever the order put it. */
  async function listed(db: Database, id: string) {
    const all = (await idsNewestFirst(db)).length;
    const page = await listIndicatorsPage(db, 1, all, EVERY_INDICATOR);
    return page.indicators.find((row) => row.id === id);
  }

  seededRepositoryTest(
    'reads a draft with nothing published as new and unsubmitted',
    async ({ db }) => {
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
    },
  );

  seededRepositoryTest(
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

  seededRepositoryTest(
    'reads a draft of a published indicator as live with an unsubmitted draft',
    async ({ db }) => {
      const { indicatorId } = await indicatorWithTwoPublications(db, 'Live with a draft');
      await createDraftFromPublished(db, indicatorId, AS_ACTOR);
      const statuses = { indicatorStatus: 'live', draftStatus: 'draft' };

      expect(await listed(db, indicatorId)).toMatchObject(statuses);
      expect(await getIndicatorById(db, indicatorId)).toMatchObject(statuses);
    },
  );

  seededRepositoryTest('reads a submitted draft as locked under its submission', async ({ db }) => {
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

  seededRepositoryTest('reads a withdrawn draft as unlocked', async ({ db }) => {
    const created = await newDraft(db, 'A withdrawn draft');
    await submitIndicator(db, created.indicatorId, await completeDraft(db, created), AS_ACTOR);
    await withdrawSubmission(db, created.indicatorId, 1, AS_ACTOR);
    const statuses = { draftLocked: false, draftSubmissionStatus: 'withdrawn' };

    expect(await listed(db, created.indicatorId)).toMatchObject(statuses);
    expect(await getIndicatorById(db, created.indicatorId)).toMatchObject(statuses);
  });

  seededRepositoryTest('reads the latest submission of a draft submitted again', async ({ db }) => {
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

  seededRepositoryTest('reads a draft in review with its reviewers by name', async ({ db }) => {
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

/** Answers the draft's first submission as Jamie Evans, who must be assigned to it. */
async function respond(db: Database, indicatorId: string, kind: ReviewResponseKind) {
  const result = await respondToReview(
    db,
    indicatorId,
    {
      submissionNumber: 1,
      kind,
      imrgReviewedOn: kind === 'pre_imrg_feedback' ? null : ukToday(),
      clarificationRequest: kind === 'approved' ? null : 'What is counted?',
      flags: [],
    },
    { userId: FAKE_USER_IDS.imrgReviewer, requestId: null },
  );
  if (!result.ok) throw new Error(`the response was refused: ${result.reason}`);
}

describe('listIndicatorsUnderReview', () => {
  /** The ids each table lists, in its order, from among `ids`. */
  async function tables(db: Database, ids: string[], scope: IndicatorListScope = EVERY_INDICATOR) {
    const { unassigned, assigned } = await listIndicatorsUnderReview(db, scope);
    const own = (rows: { id: string }[]) =>
      rows.map((row) => row.id).filter((id) => ids.includes(id));
    return { unassigned: own(unassigned), assigned: own(assigned) };
  }

  seededRepositoryTest(
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

  seededRepositoryTest(
    'keeps drafts sent back for changes or approved as assigned, with what their response said',
    async ({ db }) => {
      const sentBack = await submitted(db, 'Sent back to its publisher');
      await assign(db, sentBack, [FAKE_USER_IDS.imrgReviewer]);
      await respond(db, sentBack, 'major_revisions');
      const approved = await submitted(db, 'Approved by IMRG');
      await assign(db, approved, [FAKE_USER_IDS.imrgReviewer]);
      await respond(db, approved, 'approved');

      expect(await tables(db, [sentBack, approved])).toEqual({
        unassigned: [],
        assigned: [sentBack, approved],
      });
      const { assigned } = await listIndicatorsUnderReview(db, EVERY_INDICATOR);
      expect(
        assigned
          .filter(({ id }) => [sentBack, approved].includes(id))
          .map(({ draftSubmissionStatus, draftResponseKind }) => ({
            draftSubmissionStatus,
            draftResponseKind,
          })),
      ).toEqual([
        { draftSubmissionStatus: 'changes_requested', draftResponseKind: 'major_revisions' },
        { draftSubmissionStatus: 'approved', draftResponseKind: 'approved' },
      ]);
    },
  );

  seededRepositoryTest('names the reviewers of an indicator in review', async ({ db }) => {
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

  seededRepositoryTest(
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

  seededRepositoryTest('dates a draft submitted again by its latest submission', async ({ db }) => {
    const resubmitted = await newDraft(db, 'Submitted, withdrawn and submitted again');
    const shown = await completeDraft(db, resubmitted);
    await submitIndicator(db, resubmitted.indicatorId, shown, AS_ACTOR);
    const other = await submitted(db, 'Submitted once, in between');
    await withdrawSubmission(db, resubmitted.indicatorId, 1, AS_ACTOR);
    await submitIndicator(db, resubmitted.indicatorId, shown, AS_ACTOR);

    const { unassigned } = await tables(db, [resubmitted.indicatorId, other]);

    expect(unassigned).toEqual([other, resubmitted.indicatorId]);
  });

  seededRepositoryTest("lists only the given teams' indicators", async ({ db }) => {
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

  seededRepositoryTest('lists nothing for a scope of no teams', async ({ db }) => {
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

  /** Which of `ids` are in the reviewer's list, in the list's order. */
  async function listed(db: Database, ids: string[], reviewerId: string = REVIEWER) {
    const rows = await listIndicatorsToReview(db, reviewerId);
    return rows.map((row) => row.id).filter((id) => ids.includes(id));
  }

  seededRepositoryTest(
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

  seededRepositoryTest(
    'keeps a draft sent back for changes, with what the response said, but not an approved one',
    async ({ db }) => {
      const advised = await submitted(db, 'Advised before the meeting');
      await assign(db, advised, [REVIEWER]);
      await respond(db, advised, 'pre_imrg_feedback');
      const approved = await submitted(db, 'Approved, so off the review list');
      await assign(db, approved, [REVIEWER]);
      await respond(db, approved, 'approved');

      expect(await listed(db, [advised, approved])).toEqual([advised]);
      const rows = await listIndicatorsToReview(db, REVIEWER);
      expect(rows.find(({ id }) => id === advised)).toMatchObject({
        draftSubmissionStatus: 'changes_requested',
        draftResponseKind: 'pre_imrg_feedback',
      });
    },
  );

  seededRepositoryTest(
    'leaves out a draft whose reviewer was assigned to an earlier submission only',
    async ({ db }) => {
      const created = await newDraft(db, 'Reviewed once, in review again with someone else');
      const shown = await completeDraft(db, created);
      const { indicatorId, versionId } = created;
      await submitIndicator(db, indicatorId, shown, AS_ACTOR);
      await assign(db, indicatorId, [REVIEWER]);
      await respond(db, indicatorId, 'pre_imrg_feedback');
      await db
        .update(schema.indicatorVersionSubmission)
        .set({ revisionResponse: 'Revised as asked' })
        .where(eq(schema.indicatorVersionSubmission.indicatorVersionId, versionId));
      // The second submission carries the reviewer over, and the manager then replaces them.
      await submitIndicator(db, indicatorId, shown, AS_ACTOR);
      await assignReviewers(
        db,
        indicatorId,
        { submissionNumber: 2, previousReviewerIds: [REVIEWER], reviewerIds: [OTHER_REVIEWER] },
        AS_MANAGER,
      );

      expect(await listed(db, [indicatorId])).toEqual([]);
      expect(await listed(db, [indicatorId], OTHER_REVIEWER)).toEqual([indicatorId]);
    },
  );

  seededRepositoryTest(
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

  seededRepositoryTest('lists the oldest submission first, with its reviewers', async ({ db }) => {
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
  seededRepositoryTest(
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

  seededRepositoryTest(
    'prefers the draft name once a draft version exists',
    async ({ db, seededIds }) => {
      const target = seededIds.at(-1);
      if (target === undefined) throw new Error('The seed holds no indicators');

      await createDraftFromPublished(db, target, AS_ACTOR);
      await updateIndicatorDraft(db, target, 'name', { name: 'Edited in a draft' }, {}, AS_ACTOR);

      expect(await getIndicatorById(db, target)).toMatchObject({
        draftStatus: 'draft',
        name: 'Edited in a draft',
      });
    },
  );

  seededRepositoryTest(
    'reads the most recently published version when several exist',
    async ({ db }) => {
      const { indicatorId, currentId, currentName, currentSlug, supersededId } =
        await indicatorWithTwoPublications(db, 'Published twice');

      const found = await getIndicatorById(db, indicatorId);

      expect(supersededId > currentId).toBe(true);
      expect(found).toMatchObject({
        name: currentName,
        publishedSlug: currentSlug,
      });
      expect(found?.updatedAt.toISOString()).toBe('2030-01-01T00:00:00.000Z');
    },
  );

  seededRepositoryTest('reads the publication date the draft asks for', async ({ db }) => {
    const created = await newDraft(db, 'Asks for a date');
    expect(await getIndicatorById(db, created.indicatorId)).toMatchObject({
      draftScheduledPublishAt: null,
    });

    const scheduledPublishAt = new Date('2031-04-01T08:30:00.000Z');
    await updateIndicatorDraft(
      db,
      created.indicatorId,
      'publishing-date',
      { scheduledPublishAt },
      {},
      AS_ACTOR,
    );

    expect(await getIndicatorById(db, created.indicatorId)).toMatchObject({
      draftScheduledPublishAt: scheduledPublishAt,
    });
  });

  seededRepositoryTest(
    'reads when the draft was first submitted, through later rounds',
    async ({ db }) => {
      const created = await newDraft(db, 'First submitted once');
      const shown = await completeDraft(db, created);
      expect(await getIndicatorById(db, created.indicatorId)).toMatchObject({
        draftFirstSubmittedAt: null,
      });

      await submitIndicator(db, created.indicatorId, shown, AS_ACTOR);
      const [first] = await db
        .select({ submittedAt: schema.indicatorVersionSubmission.submittedAt })
        .from(schema.indicatorVersionSubmission)
        .where(eq(schema.indicatorVersionSubmission.indicatorId, created.indicatorId));
      await withdrawSubmission(db, created.indicatorId, 1, AS_ACTOR);
      await submitIndicator(db, created.indicatorId, shown, AS_ACTOR);

      expect(await getIndicatorById(db, created.indicatorId)).toMatchObject({
        draftSubmissionNumber: 2,
        draftFirstSubmittedAt: first?.submittedAt,
      });
    },
  );

  seededRepositoryTest('reads what the latest response to the draft said', async ({ db }) => {
    const indicatorId = await submitted(db, 'Answered with minor revisions');
    expect(await getIndicatorById(db, indicatorId)).toMatchObject({
      draftResponseKind: null,
      draftResponse: null,
    });
    await assignReviewers(
      db,
      indicatorId,
      { submissionNumber: 1, previousReviewerIds: [], reviewerIds: [FAKE_USER_IDS.imrgReviewer] },
      AS_MANAGER,
    );

    await respond(db, indicatorId, 'minor_revisions');

    expect(await getIndicatorById(db, indicatorId)).toMatchObject({
      draftSubmissionStatus: 'changes_requested',
      draftResponseKind: 'minor_revisions',
      draftResponse: { kind: 'minor_revisions', flaggedTaskCount: 0 },
    });
    expect(await getIndicatorDraftState(db, indicatorId)).toMatchObject({
      draftResponseKind: 'minor_revisions',
      draftReviewers: [{ id: FAKE_USER_IDS.imrgReviewer, name: 'Jamie Evans' }],
    });
  });

  seededRepositoryTest(
    'counts the tasks the response flagged, saved since or not',
    async ({ db }) => {
      const { indicatorId } = await sentBackDraft(db, 'Two tasks flagged', ['name', 'polarity'], {
        kind: 'pre_imrg_feedback',
        imrgReviewedOn: null,
      });
      await updateIndicatorDraft(
        db,
        indicatorId,
        'name',
        { name: 'Two tasks flagged' },
        {},
        AS_ACTOR,
      );

      expect(await getIndicatorById(db, indicatorId)).toMatchObject({
        draftResponse: { kind: 'pre_imrg_feedback', flaggedTaskCount: 2 },
      });
    },
  );

  seededRepositoryTest('forgets the response once the draft is resubmitted', async ({ db }) => {
    const created = await newDraft(db, 'Answered, then resubmitted');
    const shown = await completeDraft(db, created);
    const { indicatorId, versionId } = created;
    await submitIndicator(db, indicatorId, shown, AS_ACTOR);
    await assign(db, indicatorId, [FAKE_USER_IDS.imrgReviewer]);
    await respond(db, indicatorId, 'major_revisions');
    await db
      .update(schema.indicatorVersionSubmission)
      .set({ revisionResponse: 'Revised as asked' })
      .where(eq(schema.indicatorVersionSubmission.indicatorVersionId, versionId));

    expect(await submitIndicator(db, indicatorId, shown, AS_ACTOR)).toEqual({ ok: true });

    expect(await getIndicatorById(db, indicatorId)).toMatchObject({
      draftSubmissionNumber: 2,
      draftSubmissionStatus: 'in_review',
      draftResponseKind: null,
      draftResponse: null,
    });
    expect(await getIndicatorDraftState(db, indicatorId)).toMatchObject({
      draftResponseKind: null,
    });
  });

  seededRepositoryTest(
    "ignores a published version's date when there is no draft",
    async ({ db }) => {
      const { indicatorId } = await indicatorWithTwoPublications(db, 'Published with a date');
      await db
        .update(schema.indicatorVersion)
        .set({ scheduledPublishAt: new Date('2030-01-01T09:30:00.000Z') })
        .where(eq(schema.indicatorVersion.indicatorId, indicatorId));

      expect(await getIndicatorById(db, indicatorId)).toMatchObject({
        draftStatus: null,
        draftScheduledPublishAt: null,
      });
    },
  );

  seededRepositoryTest('returns nothing for an id no indicator has', async ({ db }) => {
    expect(await getIndicatorById(db, '00000000-0000-7000-8000-000000000000')).toBeUndefined();
  });
});

describe('findIndicatorAccess', () => {
  seededRepositoryTest("reads the team and the draft's reviewers", async ({ db }) => {
    const indicatorId = await submitted(db, 'Access read in review');
    await assign(db, indicatorId, [FAKE_USER_IDS.imrgReviewer]);

    expect(await findIndicatorAccess(db, indicatorId)).toEqual({
      teamId: TEAM_IDS.teamA,
      draftReviewers: [{ id: FAKE_USER_IDS.imrgReviewer, name: 'Jamie Evans' }],
    });
  });

  seededRepositoryTest(
    'reads no reviewers for a seeded indicator, which nobody reviews',
    async ({ db, seededIds }) => {
      const target = seededIds[0];
      if (target === undefined) throw new Error('The seed holds no indicators');

      expect(await findIndicatorAccess(db, target)).toMatchObject({ draftReviewers: [] });
    },
  );

  seededRepositoryTest('answers undefined for no such indicator', async ({ db }) => {
    expect(await findIndicatorAccess(db, '00000000-0000-7000-8000-000000000000')).toBeUndefined();
  });
});

describe('sharing one connection with the public repositories', () => {
  // internal-api serves both surfaces from one connection, and drizzle keys its column-name
  // cache on the unqualified relation name: the indicator table must not shadow the view.
  seededRepositoryTest(
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
