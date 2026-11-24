import { requireApiSession, requireJwtSession } from '@fphd/api-server';
import type { JwtSessionVerifier } from '@fphd/auth/jwt-session';
import {
  canSeeIndicator,
  canUseInternalService,
  canWorkOnIndicator,
  type IndicatorAccess,
  type SessionUser,
} from '@fphd/auth/permissions';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { indicatorAccess, indicatorIdSchema } from './contract.ts';
import type { InternalIndicatorRepository } from './repositories.ts';

export type IndicatorAccessReader = Pick<InternalIndicatorRepository, 'findAccess'>;

/** What a route may do to an indicator the user works on, such as `canEditIndicator`. */
export type IndicatorCheck = (user: SessionUser, indicator: IndicatorAccess) => boolean;

/** The indicator a guarded route acts on, as its guard read it. */
export interface GuardedIndicator {
  readonly id: string;
  readonly access: IndicatorAccess;
}

// Express types every local as `any`, so both ends of the one key we set go through this view.
function guardedLocals(response: Response): { guardedIndicator?: GuardedIndicator } {
  return response.locals;
}

/**
 * The guard on every route the indicator `:id` names, apart from its overview and preview. It
 * answers:
 *
 * - 400 for an id that is not one
 * - 404 for no such indicator, or one the user does not work on
 * - 403 when `allows` refuses a user who works on it
 */
export function requireIndicatorAccess(
  session: JwtSessionVerifier,
  indicators: IndicatorAccessReader,
  allows: IndicatorCheck,
): RequestHandler {
  return guardIndicator(session, indicators, canWorkOnIndicator, allows);
}

/**
 * The guard on the indicator's overview and preview, which `canSeeIndicator` opens to more users
 * than work on it. It answers 400 for an id that is not one, and 404 for no such indicator or one
 * the user may not see.
 */
export function requireIndicatorViewer(
  session: JwtSessionVerifier,
  indicators: IndicatorAccessReader,
): RequestHandler {
  return guardIndicator(session, indicators, canSeeIndicator);
}

/** Both guards: 404 for an indicator `shows` refuses, then 403 when `allows`, if any, refuses. */
function guardIndicator(
  session: JwtSessionVerifier,
  indicators: IndicatorAccessReader,
  shows: IndicatorCheck,
  allows?: IndicatorCheck,
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

    if (access === undefined || !shows(user, access)) {
      response.status(404).json({ error: 'not_found' });
      return;
    }

    if (allows !== undefined && !allows(user, access)) {
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

/** The indicator an indicator guard admitted; only a route behind one can ask. */
export function guardedIndicator(response: Response): GuardedIndicator {
  const indicator = guardedLocals(response).guardedIndicator;

  if (indicator === undefined) {
    throw new Error('guardedIndicator called outside a route behind an indicator guard');
  }

  return indicator;
}
