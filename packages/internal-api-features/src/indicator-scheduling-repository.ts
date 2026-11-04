import { type Database, schema } from '@fphd/db';
import { type Actor, changesBetween } from '@fphd/db/audit-log';
import { eq } from 'drizzle-orm';

import {
  type IndicatorStepResult,
  type IndicatorStepWrite,
  takeIndicatorStep,
} from './indicator-workflow-repository.ts';

const { indicatorVersion } = schema;

/** The publication date an admin confirms, and the one the page showed them. */
export interface PublicationSchedule {
  scheduledPublishAt: Date;
  shownScheduledPublishAt: Date;
}

function publicationDateWrite(scheduledPublishAt: Date): IndicatorStepWrite {
  return async (tx, submission, draft) => {
    const [row] = await tx
      .update(indicatorVersion)
      .set({ scheduledPublishAt })
      .where(eq(indicatorVersion.id, submission.indicatorVersionId))
      .returning({ scheduledPublishAt: indicatorVersion.scheduledPublishAt });
    if (row === undefined) throw new Error(`dated no version ${submission.indicatorVersionId}`);
    return changesBetween({ scheduledPublishAt: draft.scheduledPublishAt }, row);
  };
}

/**
 * Confirms an approved indicator's publication date, which schedules it, or changes the date of
 * one already scheduled. A stored date other than the one the admin was shown refuses it as
 * `changed`, so nobody overwrites a date they have not seen.
 */
export function schedulePublication(
  db: Database,
  indicatorId: string,
  { scheduledPublishAt, shownScheduledPublishAt }: PublicationSchedule,
  actor: Actor,
): Promise<IndicatorStepResult<'changed'>> {
  return takeIndicatorStep(
    db,
    indicatorId,
    (_latest, draft) => (draft.status === 'scheduled' ? 'change_publication_date' : 'schedule'),
    actor,
    {
      precondition: async (_tx, { draft }) =>
        draft.scheduledPublishAt?.getTime() === shownScheduledPublishAt.getTime()
          ? undefined
          : 'changed',
      write: publicationDateWrite(scheduledPublishAt),
    },
  );
}
