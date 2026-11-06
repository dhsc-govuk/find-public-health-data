import { requireApiSession, requireJwtSession } from '@fphd/api-server';
import type { JwtSessionVerifier } from '@fphd/auth/jwt-session';
import {
  canSeeIndicator,
  canUseInternalService,
  type IndicatorAccess,
  type SessionUser,
} from '@fphd/auth/permissions';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { indicatorAccess, indicatorIdSchema } from './contract.ts';
import type { InternalIndicatorRepository } from './repositories.ts';

export type IndicatorAccessReader = Pick<InternalIndicatorRepository, 'findAccess'>;

/** What a route may do to an indicator the user may see, such as `canEditIndicator`. */
export type IndicatorCheck = (user: SessionUser, indicator: IndicatorAccess) => boolean;

/** The indicator a guarded route acts on, as `requireIndicatorAccess` read it. */
export interface GuardedIndicator {
  readonly id: string;
  readonly access: IndicatorAccess;
}

// Express types every local as `any`, so both ends of the one key we set go through this view.
function guardedLocals(response: Response): { guardedIndicator?: GuardedIndicator } {
  return response.locals;
}

/**
 * The guard on every route the indicator `:id` names. It answers:
 *
 * - 400 for an id that is not one
 * - 404 for no such indicator, or one the user may not see
 * - 403 when `allows` refuses a user who may see it
 */
export function requireIndicatorAccess(
  session: JwtSessionVerifier,
  indicators: IndicatorAccessReader,
  allows: IndicatorCheck,
): RequestHandler {
  const requireSession = requireJwtSession(session, canUseInternalService);

  async function checkIndicator(request: Request, response: Response, next: NextFunction) {
    const id = indicatorIdSchema.safeParse(request.params.id);

    if (!id.success) {
      response.status(400).json({ error: 'invalid_id' });
      return;
    }

    const row = await indicators.findAccess(id.data);
    const user = requireApiSession(response);
    const access = row && indicatorAccess(row);

    if (access === undefined || !canSeeIndicator(user, access)) {
      response.status(404).json({ error: 'not_found' });
      return;
    }

    if (!allows(user, access)) {
      response.status(403).json({ error: 'forbidden' });
      return;
    }

    guardedLocals(response).guardedIndicator = { id: id.data, access };
    next();
  }

  // requireJwtSession drops whatever its next returns, so the indicator check hands its own
  // failure on.
  return (request, response, next) =>
    requireSession(request, response, (error?: unknown) => {
      if (error === undefined) {
        checkIndicator(request, response, next).catch(next);
      } else {
        next(error);
      }
    });
}

/** The indicator `requireIndicatorAccess` admitted; only a route behind it can ask. */
export function guardedIndicator(response: Response): GuardedIndicator {
  const indicator = guardedLocals(response).guardedIndicator;

  if (indicator === undefined) {
    throw new Error('guardedIndicator called outside a route requireIndicatorAccess guards');
  }

  return indicator;
}
