import { FAKE_USER_IDS } from '@fphd/auth';
import { type Database, schema } from '@fphd/db';
import { auditEntriesFor } from '@fphd/db/testing';
import { asc, eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';

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
