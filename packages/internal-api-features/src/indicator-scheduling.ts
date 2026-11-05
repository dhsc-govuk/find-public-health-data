import { requireApiActor } from '@fphd/api-server';
import type { JwtSessionVerifier } from '@fphd/auth/jwt-session';
import { Router } from 'express';

import {
  type IndicatorScheduleError,
  indicatorScheduleBodySchema,
  publishingDateSection,
  scheduleSchemaFor,
  toFieldErrors,
} from './contract.ts';
import { guardedIndicator } from './indicator-access.ts';
import { refuse, requireStep } from './indicator-submissions.ts';
import type { InternalIndicatorRepository } from './repositories.ts';

/**
 * An admin confirming an approved indicator's publication date, or changing it once confirmed.
 * `now` is the clock the date must come after.
 */
export function indicatorSchedulingRouter(
  indicators: Pick<InternalIndicatorRepository, 'findAccess' | 'schedule'>,
  session: JwtSessionVerifier,
  now: () => Date = () => new Date(),
): Router {
  const router = Router();

  router.post(
    '/api/internal/indicators/:id/schedule',
    // Both scheduling steps take the same permission, so either one checks it.
    requireStep(session, indicators, 'schedule'),
    async (request, response) => {
      const { id } = guardedIndicator(response);

      const body = indicatorScheduleBodySchema.safeParse(request.body);

      if (!body.success) {
        response.status(400).json({ error: 'invalid_request' } satisfies IndicatorScheduleError);
        return;
      }

      const sent = scheduleSchemaFor(now()).safeParse(body.data);

      if (!sent.success) {
        response.status(400).json({
          error: 'validation_failed',
          fieldErrors: toFieldErrors(sent.error, publishingDateSection.fields),
        } satisfies IndicatorScheduleError);
        return;
      }

      const result = await indicators.schedule(
        id,
        {
          scheduledPublishAt: sent.data.scheduledPublishAt,
          shownScheduledPublishAt: new Date(body.data.shownScheduledPublishAt),
        },
        requireApiActor(request, response),
      );

      if (!result.ok) {
        refuse(response, result);
        return;
      }

      request.log.info({ indicatorId: id }, 'Publication date confirmed');
      response.status(204).end();
    },
  );

  return router;
}
