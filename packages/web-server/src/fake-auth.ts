import { type FakeUser, normalizeReturnTo } from '@fphd/auth';
import type { JwtSessionService } from '@fphd/auth/jwt-session';
import express, { type Router } from 'express';
import { v7 as uuidv7 } from 'uuid';

interface PendingSignIn {
  readonly expiresAt: number;
  readonly returnTo: string;
  readonly user: FakeUser;
}

export interface FakeAuthRouterOptions {
  clock?: () => Date;
  codeLifetimeSeconds?: number;
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

function readQueryValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function createFakeAuthRouter({
  clock = () => new Date(),
  codeLifetimeSeconds = 300,
  defaultReturnTo = '/',
  isPagePath,
  session,
  sessionLifetimeSeconds = 8 * 60 * 60,
  users,
}: FakeAuthRouterOptions): Router {
  const pendingSignIns = new Map<string, PendingSignIn>();
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

    const now = clock().getTime();
    for (const [code, signIn] of pendingSignIns) {
      if (signIn.expiresAt <= now) pendingSignIns.delete(code);
    }

    const code = uuidv7();
    pendingSignIns.set(code, {
      expiresAt: now + codeLifetimeSeconds * 1_000,
      returnTo: await returnToFrom(request.body, defaultReturnTo),
      user,
    });

    response.redirect(303, `/auth/callback?code=${encodeURIComponent(code)}`);
  });

  router.get('/auth/callback', async (request, response) => {
    const code = readQueryValue(request.query.code);
    const signIn = code === undefined ? undefined : pendingSignIns.get(code);

    if (code === undefined || signIn === undefined || signIn.expiresAt <= clock().getTime()) {
      if (code !== undefined) pendingSignIns.delete(code);
      response.status(400).send('The sign-in request is invalid or has expired.');
      return;
    }

    pendingSignIns.delete(code);
    const token = await session.issueToken({
      expiresInSeconds: sessionLifetimeSeconds,
      roles: signIn.user.roles,
      subject: signIn.user.id,
      teams: signIn.user.teamIds,
    });

    response.setHeader('Set-Cookie', session.createCookieHeader(token, sessionLifetimeSeconds));
    response.redirect(303, signIn.returnTo);
  });

  router.post('/auth/sign-out', parseForm, async (request, response) => {
    response.setHeader('Set-Cookie', session.clearCookieHeader());
    response.redirect(303, await returnToFrom(request.body, defaultReturnTo));
  });

  return router;
}
