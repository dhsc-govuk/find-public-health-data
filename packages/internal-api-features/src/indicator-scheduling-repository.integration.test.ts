import { FAKE_USER_IDS } from '@fphd/auth';
import { type Database, schema } from '@fphd/db';
import { auditEntriesFor } from '@fphd/db/testing';
import { asc, eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import { listIndicatorsScheduled } from './indicator-list-repository.ts';
import { AS_ACTOR, newDraft, repositoryTest } from './indicator-repository.testing.ts';
import { schedulePublication } from './indicator-scheduling-repository.ts';
import {
  AS_ADMIN,
  completeDraft,
  scheduledDraft,
  scheduledPublishAtOf,
  sentBackDraft,
} from './indicator-workflow.testing.ts';
import { stepWhileWriteHolds } from './indicator-workflow-concurrency.testing.ts';
import { submitIndicator } from './indicator-workflow-repository.ts';

const { indicatorVersion, indicatorVersionSubmission } = schema;

const SCHEDULING_ACTIONS = [
  'indicator.publication_scheduled',
  'indicator.publication_date_changed',
];

const NEXT_YEAR = new Date('2027-11-04T09:30:00.000Z');
const EARLIER = new Date('2027-06-01T08:30:00.000Z');
// The date the task list fixture's complete draft proposes, between EARLIER and LATER.
const PROPOSED = new Date('2027-09-14T08:30:00.000Z');
const LATER = new Date('2027-12-01T15:00:00.000Z');

async function versionOf(db: Database, versionId: string) {
  const [row] = await db
    .select({
      status: indicatorVersion.status,
      isLocked: indicatorVersion.isLocked,
      scheduledPublishAt: indicatorVersion.scheduledPublishAt,
      updatedAt: indicatorVersion.updatedAt,
      updatedBy: indicatorVersion.updatedBy,
    })
    .from(indicatorVersion)
    .where(eq(indicatorVersion.id, versionId));
  if (row === undefined) throw new Error(`no version ${versionId}`);
  return row;
}

function submissionsOf(db: Database, versionId: string) {
  return db
    .select()
    .from(indicatorVersionSubmission)
    .where(eq(indicatorVersionSubmission.indicatorVersionId, versionId))
    .orderBy(asc(indicatorVersionSubmission.number));
}

async function schedulingEntriesFor(db: Database, indicatorId: string) {
  const entries = await auditEntriesFor(db, indicatorId);
  return entries.filter(({ action }) => SCHEDULING_ACTIONS.includes(action));
}

describe('schedulePublication', () => {
  repositoryTest(
    'schedules an approved draft on the date confirmed, leaving its submission and last edit',
    async ({ db }) => {
      const { indicatorId, versionId } = await sentBackDraft(db, 'Confirmed date indicator', [], {
        kind: 'approved',
      });
      const proposed = await scheduledPublishAtOf(db, versionId);
      const before = await versionOf(db, versionId);
      const submissions = await submissionsOf(db, versionId);

      const result = await schedulePublication(
        db,
        indicatorId,
        { scheduledPublishAt: NEXT_YEAR, shownScheduledPublishAt: proposed },
        AS_ADMIN,
      );

      expect(result).toEqual({ ok: true });
      expect(await versionOf(db, versionId)).toEqual({
        ...before,
        status: 'scheduled',
        scheduledPublishAt: NEXT_YEAR,
      });
      expect(await submissionsOf(db, versionId)).toEqual(submissions);
      expect(await schedulingEntriesFor(db, indicatorId)).toEqual([
        {
          actorId: FAKE_USER_IDS.admin,
          action: 'indicator.publication_scheduled',
          entityType: 'indicator',
          requestId: null,
          changes: {
            status: { before: 'draft', after: 'scheduled' },
            scheduledPublishAt: { before: proposed.toISOString(), after: NEXT_YEAR.toISOString() },
          },
        },
      ]);
    },
  );

  repositoryTest('records the status alone when the proposed date is confirmed', async ({ db }) => {
    const { indicatorId, versionId } = await scheduledDraft(db, 'Proposed date indicator');

    expect(await versionOf(db, versionId)).toMatchObject({ status: 'scheduled' });
    expect(await schedulingEntriesFor(db, indicatorId)).toEqual([
      expect.objectContaining({
        action: 'indicator.publication_scheduled',
        changes: { status: { before: 'draft', after: 'scheduled' } },
      }),
    ]);
  });

  repositoryTest(
    'changes the date of a scheduled version, keeping it scheduled',
    async ({ db }) => {
      const { indicatorId, versionId } = await scheduledDraft(db, 'Changed date indicator');
      const confirmed = await scheduledPublishAtOf(db, versionId);

      const result = await schedulePublication(
        db,
        indicatorId,
        { scheduledPublishAt: LATER, shownScheduledPublishAt: confirmed },
        AS_ADMIN,
      );

      expect(result).toEqual({ ok: true });
      expect(await versionOf(db, versionId)).toMatchObject({
        status: 'scheduled',
        isLocked: true,
        scheduledPublishAt: LATER,
      });
      expect((await schedulingEntriesFor(db, indicatorId)).at(-1)).toEqual(
        expect.objectContaining({
          actorId: FAKE_USER_IDS.admin,
          action: 'indicator.publication_date_changed',
          changes: {
            scheduledPublishAt: { before: confirmed.toISOString(), after: LATER.toISOString() },
          },
        }),
      );
    },
  );

  repositoryTest('refuses a date other than the one stored as changed', async ({ db }) => {
    const { indicatorId, versionId } = await scheduledDraft(db, 'Stale date indicator');
    const before = await versionOf(db, versionId);

    const result = await schedulePublication(
      db,
      indicatorId,
      { scheduledPublishAt: LATER, shownScheduledPublishAt: NEXT_YEAR },
      AS_ADMIN,
    );

    expect(result).toEqual({ ok: false, reason: 'changed' });
    expect(await versionOf(db, versionId)).toEqual(before);
    expect(await schedulingEntriesFor(db, indicatorId)).toHaveLength(1);
  });

  repositoryTest('refuses a draft not yet approved as not allowed', async ({ db }) => {
    const draft = await newDraft(db, 'Unapproved date indicator');
    const shown = await completeDraft(db, draft);
    await submitIndicator(db, draft.indicatorId, shown, AS_ACTOR);
    const proposed = await scheduledPublishAtOf(db, draft.versionId);

    const result = await schedulePublication(
      db,
      draft.indicatorId,
      { scheduledPublishAt: NEXT_YEAR, shownScheduledPublishAt: proposed },
      AS_ADMIN,
    );

    expect(result).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await versionOf(db, draft.versionId)).toMatchObject({
      status: 'draft',
      scheduledPublishAt: proposed,
    });
  });
});

describe('two admins confirming the same date at once', () => {
  repositoryTest(
    'refuses the second as changed once the first has moved the date',
    async ({ db }) => {
      const { indicatorId, versionId } = await sentBackDraft(db, 'Racing change indicator', [], {
        kind: 'approved',
      });
      const shown = await scheduledPublishAtOf(db, versionId);
      const confirm = (scheduledPublishAt: Date) => () =>
        schedulePublication(
          db,
          indicatorId,
          { scheduledPublishAt, shownScheduledPublishAt: shown },
          AS_ADMIN,
        );

      const raced = await stepWhileWriteHolds(db, confirm(NEXT_YEAR), confirm(LATER));

      expect(raced).toEqual({ write: { ok: true }, step: { ok: false, reason: 'changed' } });
      expect(await versionOf(db, versionId)).toMatchObject({
        status: 'scheduled',
        scheduledPublishAt: NEXT_YEAR,
      });
    },
  );

  repositoryTest(
    'lets the second change the date when the first confirmed it as shown',
    async ({ db }) => {
      const { indicatorId, versionId } = await sentBackDraft(db, 'Racing confirm indicator', [], {
        kind: 'approved',
      });
      const shown = await scheduledPublishAtOf(db, versionId);
      const confirm = (scheduledPublishAt: Date) => () =>
        schedulePublication(
          db,
          indicatorId,
          { scheduledPublishAt, shownScheduledPublishAt: shown },
          AS_ADMIN,
        );

      const raced = await stepWhileWriteHolds(db, confirm(shown), confirm(LATER));

      expect(raced).toEqual({ write: { ok: true }, step: { ok: true } });
      expect(await versionOf(db, versionId)).toMatchObject({
        status: 'scheduled',
        scheduledPublishAt: LATER,
      });
      expect((await schedulingEntriesFor(db, indicatorId)).map(({ action }) => action)).toEqual([
        'indicator.publication_scheduled',
        'indicator.publication_date_changed',
      ]);
    },
  );
});

describe('listIndicatorsScheduled', () => {
  repositoryTest(
    'lists scheduled versions soonest date first, leaving out a draft not yet approved',
    async ({ db }) => {
      const later = await scheduledDraft(db, 'Listed later indicator');
      const sooner = await sentBackDraft(db, 'Listed sooner indicator', [], { kind: 'approved' });
      const inReview = await newDraft(db, 'Listed unapproved indicator');
      await submitIndicator(db, inReview.indicatorId, await completeDraft(db, inReview), AS_ACTOR);
      await schedulePublication(
        db,
        later.indicatorId,
        {
          scheduledPublishAt: LATER,
          shownScheduledPublishAt: await scheduledPublishAtOf(db, later.versionId),
        },
        AS_ADMIN,
      );
      await schedulePublication(
        db,
        sooner.indicatorId,
        {
          scheduledPublishAt: NEXT_YEAR,
          shownScheduledPublishAt: await scheduledPublishAtOf(db, sooner.versionId),
        },
        AS_ADMIN,
      );
      const ours = [later.indicatorId, sooner.indicatorId, inReview.indicatorId];

      const rows = await listIndicatorsScheduled(db, { all: true });

      expect(rows.filter(({ id }) => ours.includes(id))).toEqual([
        expect.objectContaining({
          id: sooner.indicatorId,
          draftStatus: 'scheduled',
          draftSubmissionStatus: 'approved',
          teamName: expect.any(String),
          createdBy: expect.any(String),
        }),
        expect.objectContaining({ id: later.indicatorId, draftStatus: 'scheduled' }),
      ]);
      expect(rows.every(({ draftSubmissionStatus }) => draftSubmissionStatus === 'approved')).toBe(
        true,
      );
    },
  );

  repositoryTest(
    'places a draft pending scheduling by its proposed date among the scheduled ones',
    async ({ db }) => {
      const schedule = async (name: string, scheduledPublishAt: Date) => {
        const draft = await sentBackDraft(db, name, [], { kind: 'approved' });
        await schedulePublication(
          db,
          draft.indicatorId,
          {
            scheduledPublishAt,
            shownScheduledPublishAt: await scheduledPublishAtOf(db, draft.versionId),
          },
          AS_ADMIN,
        );
        return draft.indicatorId;
      };
      const first = await schedule('Listed first indicator', EARLIER);
      const last = await schedule('Listed last indicator', LATER);
      const pending = await sentBackDraft(db, 'Listed pending indicator', [], { kind: 'approved' });
      const ours = [first, last, pending.indicatorId];

      expect(await scheduledPublishAtOf(db, pending.versionId)).toEqual(PROPOSED);

      const rows = await listIndicatorsScheduled(db, { all: true });

      expect(
        rows
          .filter(({ id }) => ours.includes(id))
          .map(({ id, draftStatus }) => ({ id, draftStatus })),
      ).toEqual([
        { id: first, draftStatus: 'scheduled' },
        { id: pending.indicatorId, draftStatus: 'draft' },
        { id: last, draftStatus: 'scheduled' },
      ]);
    },
  );

  repositoryTest('keeps to the scope', async ({ db }) => {
    const { indicatorId } = await scheduledDraft(db, 'Listed scoped indicator');

    const none = await listIndicatorsScheduled(db, { all: false, teamIds: [] });
    const otherTeam = await listIndicatorsScheduled(db, {
      all: false,
      teamIds: ['00000000-0000-7000-8000-00000000000b'],
    });

    expect(none).toEqual([]);
    expect(otherTeam.map(({ id }) => id)).not.toContain(indicatorId);
  });
});
