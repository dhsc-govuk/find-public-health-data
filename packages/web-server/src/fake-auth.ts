import { type FakeUser, normalizeReturnTo } from '@fphd/auth';
import type { JwtSessionService } from '@fphd/auth/jwt-session';
import express, { type Router } from 'express';

export interface FakeAuthRouterOptions {
  defaultReturnTo?: string;
  /** Whether a return address is one of the app's pages; anything else falls back to the default. */
  isPagePath: (path: string) => boolean | Promise<boolean>;
  session: JwtSessionService;
  sessionLifetimeSeconds?: number;
  users: readonly FakeUser[];
}

function readStringField(body: unknown, name: string): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined;

  const value = Reflect.get(body, name);
  return typeof value === 'string' ? value : undefined;
}

export function createFakeAuthRouter({
  defaultReturnTo = '/',
  isPagePath,
  session,
  sessionLifetimeSeconds = 8 * 60 * 60,
  users,
}: FakeAuthRouterOptions): Router {
  const router = express.Router();
  // Per route: this router fronts the whole app, and a parser on all of it would leave every
  // React Router action's `request.formData()` empty.
  const parseForm = express.urlencoded({ extended: false });

  async function returnToFrom(body: unknown, fallback: string): Promise<string> {
    const returnTo = normalizeReturnTo(readStringField(body, 'returnTo'), fallback);

    return (await isPagePath(returnTo)) ? returnTo : fallback;
  }

  router.post('/auth/sign-in', parseForm, async (request, response) => {
    const userId = readStringField(request.body, 'userId');
    const user = users.find((candidate) => candidate.id === userId);

    if (user === undefined) {
      response.status(403).send('This user cannot access this service.');
      return;
    }

    const token = await session.issueToken({
      expiresInSeconds: sessionLifetimeSeconds,
      roles: user.roles,
      subject: user.id,
      teams: user.teamIds,
    });

    response.setHeader('Set-Cookie', session.createCookieHeader(token, sessionLifetimeSeconds));
    response.redirect(303, await returnToFrom(request.body, defaultReturnTo));
  });

  router.post('/auth/sign-out', parseForm, async (request, response) => {
    response.setHeader('Set-Cookie', session.clearCookieHeader());
    response.redirect(303, await returnToFrom(request.body, defaultReturnTo));
  });

  return router;
}
