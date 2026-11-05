import { type Database, schema } from '@fphd/db';
import type { Actor } from '@fphd/db/audit-log';
import { auditEntriesFor } from '@fphd/db/testing';
import {
  type SteppedVersion,
  takeIndicatorStep,
  takeIndicatorStepIn,
} from '@fphd/internal-workflow';
import { asc, eq, sql } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import { repositoryTest } from './indicator-repository.testing.ts';
import { scheduledDraft, sentBackDraft } from './indicator-workflow.testing.ts';

const { indicatorVersion, indicatorVersionSubmission, SYSTEM_USER_IDS } = schema;

const AS_SCHEDULED_PUBLICATION: Actor = {
  userId: SYSTEM_USER_IDS.scheduledPublication,
  requestId: null,
};

async function versionOf(db: Database, versionId: string) {
  const [row] = await db
    .select({
      status: indicatorVersion.status,
      isLocked: indicatorVersion.isLocked,
      publishedAt: indicatorVersion.publishedAt,
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

async function databaseNow(db: Database): Promise<Date> {
  const [row] = await db.execute<{ now: string }>(sql`SELECT clock_timestamp()::text AS now`);
  return new Date(row?.now ?? '');
}

describe('the publish step', () => {
  repositoryTest(
    'publishes a scheduled version locked, at the time it is taken, as Scheduled publication',
    async ({ db }) => {
      const { indicatorId, versionId } = await scheduledDraft(db, 'Published by its step');
      const submissions = await submissionsOf(db, versionId);
      const before = await databaseNow(db);

      const result = await takeIndicatorStep(db, indicatorId, 'publish', AS_SCHEDULED_PUBLICATION);

      const after = await databaseNow(db);
      const version = await versionOf(db, versionId);
      expect(result).toEqual({ ok: true });
      expect(version).toMatchObject({ status: 'published', isLocked: true });
      expect(version.publishedAt?.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(version.publishedAt?.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(await submissionsOf(db, versionId)).toEqual(submissions);
      expect((await auditEntriesFor(db, indicatorId)).at(-1)).toEqual({
        actorId: SYSTEM_USER_IDS.scheduledPublication,
        action: 'indicator.published',
        entityType: 'indicator',
        requestId: null,
        changes: {
          status: { before: 'scheduled', after: 'published' },
          publishedAt: { before: null, after: version.publishedAt?.toISOString() },
        },
      });
    },
  );

  repositoryTest('gives its write the version as the step left it', async ({ db }) => {
    const { indicatorId, versionId } = await scheduledDraft(db, 'Published, written after');
    let written: SteppedVersion | undefined;

    await takeIndicatorStep(db, indicatorId, 'publish', AS_SCHEDULED_PUBLICATION, {
      write: async (_tx, _submission, _draft, version) => {
        written = version;
        return {};
      },
    });

    expect(written).toEqual(await versionOf(db, versionId));
  });

  repositoryTest('refuses an approved draft not yet scheduled, writing nothing', async ({ db }) => {
    const { indicatorId, versionId } = await sentBackDraft(db, 'Approved, not scheduled', [], {
      kind: 'approved',
    });
    const version = await versionOf(db, versionId);
    const entries = await auditEntriesFor(db, indicatorId);

    const result = await takeIndicatorStep(db, indicatorId, 'publish', AS_SCHEDULED_PUBLICATION);

    expect(result).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await versionOf(db, versionId)).toEqual(version);
    expect(await auditEntriesFor(db, indicatorId)).toEqual(entries);
  });

  repositoryTest("is undone with the caller's transaction", async ({ db }) => {
    const { indicatorId, versionId } = await scheduledDraft(db, 'Published, then rolled back');
    const version = await versionOf(db, versionId);
    const entries = await auditEntriesFor(db, indicatorId);
    const rollback = new Error('roll back the publication');

    await expect(
      db.transaction(async (tx) => {
        const result = await takeIndicatorStepIn(
          tx,
          indicatorId,
          'publish',
          AS_SCHEDULED_PUBLICATION,
        );
        expect(result).toEqual({ ok: true });
        throw rollback;
      }),
    ).rejects.toBe(rollback);

    expect(await versionOf(db, versionId)).toEqual(version);
    expect(await auditEntriesFor(db, indicatorId)).toEqual(entries);
  });
});
