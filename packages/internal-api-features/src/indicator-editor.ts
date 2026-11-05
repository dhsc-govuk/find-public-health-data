import { requireApiSession, requireJwtSession } from '@fphd/api-server';
import type { JwtSessionVerifier } from '@fphd/auth/jwt-session';
import { canEditIndicator, canEditIndicators } from '@fphd/auth/permissions';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { indicatorIdSchema } from './contract.ts';
import type { InternalIndicatorRepository } from './repositories.ts';

export type IndicatorTeams = Pick<InternalIndicatorRepository, 'findTeamId'>;

/**
 * The guard on every route that edits the indicator `:id` names: a publisher who may not edit it
 * reads it as one that does not exist and is refused a write. An id that is not one, or names no
 * indicator, passes to the route, which answers it as it otherwise would.
 */
export function requireIndicatorEditor(
  session: JwtSessionVerifier,
  indicators: IndicatorTeams,
): RequestHandler {
  const requirePublisher = requireJwtSession(session, canEditIndicators);
  async function requireTeam(request: Request, response: Response, next: NextFunction) {
    const id = indicatorIdSchema.safeParse(request.params.id);
    const teamId = id.success ? await indicators.findTeamId(id.data) : undefined;

    if (teamId === undefined || canEditIndicator(requireApiSession(response), { teamId })) {
      next();
      return;
    }

    if (request.method === 'GET' || request.method === 'HEAD') {
      response.status(404).json({ error: 'not_found' });
    } else {
      response.status(403).json({ error: 'forbidden' });
    }
  }

  // requireJwtSession drops whatever its next returns, so the team check hands its own failure on.
  return (request, response, next) =>
    requirePublisher(request, response, (error?: unknown) => {
      if (error === undefined) {
        requireTeam(request, response, next).catch(next);
      } else {
        next(error);
      }
    });
}
