import { requireApiActor } from '@fphd/api-server';
import type { JwtSessionVerifier } from '@fphd/auth/jwt-session';
import { Router } from 'express';

import {
  reviewResponseFieldSchema,
  reviewResponseSchemaFor,
  toFieldErrors,
  type UpdateDecisionBody,
  type UpdateDecisionError,
  updateDecisionBodySchema,
} from './contract.ts';
import { guardedIndicator } from './indicator-access.ts';
import { refuse, requireStep } from './indicator-submissions.ts';
import type { InternalIndicatorRepository } from './repositories.ts';
import { revisionsAsFeedback } from './update-decision-contract.ts';

/** Where the core team posts its decision on an update, which may carry many long flags. */
export const UPDATE_DECISION_PATH = '/api/internal/indicators/:id/update-decision';

/**
 * The core team deciding what happens to a submitted update. `now` is the clock the revisions'
 * rules are checked against, as a reviewer's are.
 */
export function updateDecisionRouter(
  indicators: Pick<InternalIndicatorRepository, 'findAccess' | 'decideUpdate'>,
  session: JwtSessionVerifier,
  now: () => Date = () => new Date(),
): Router {
  const router = Router();

  router.post(
    UPDATE_DECISION_PATH,
    // Every decision step takes the same permission, so any one of them checks it.
    requireStep(session, indicators, 'send_update_to_imrg'),
    async (request, response) => {
      const { id } = guardedIndicator(response);

      const body = updateDecisionBodySchema.safeParse(request.body);

      if (!body.success) {
        response.status(400).json({ error: 'invalid_request' } satisfies UpdateDecisionError);
        return;
      }

      let decision: UpdateDecisionBody = body.data;

      if (decision.decision === 'request_revisions') {
        const sent = reviewResponseSchemaFor(now()).safeParse(revisionsAsFeedback(decision));

        if (!sent.success) {
          response.status(400).json({
            error: 'validation_failed',
            fieldErrors: toFieldErrors(sent.error, reviewResponseFieldSchema),
          } satisfies UpdateDecisionError);
          return;
        }

        decision = {
          ...decision,
          clarificationRequest: sent.data.clarificationRequest,
          flags: sent.data.flags,
        };
      }

      const result = await indicators.decideUpdate(
        id,
        decision,
        requireApiActor(request, response),
      );

      if (!result.ok) {
        refuse(response, result);
        return;
      }

      request.log.info(
        { indicatorId: id, decision: decision.decision },
        'Update decision recorded',
      );
      response.status(204).end();
    },
  );

  return router;
}
