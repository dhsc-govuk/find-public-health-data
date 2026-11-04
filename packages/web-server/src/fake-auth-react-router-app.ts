import { type AppAudience, fakeUsersForAudience, sessionCookieName } from '@fphd/auth';
import {
  createJwtSessionService,
  createJwtSessionVerifier,
  type JwtSessionServiceOptions,
} from '@fphd/auth/jwt-session';

import type { Request } from 'express';
import type { RouterContextProvider } from 'react-router';

import { createFakeAuthRouter } from './fake-auth.ts';
import { createPagePathCheck } from './page-paths.ts';
import { createReactRouterApp, type ReactRouterBuildLoader } from './react-router-app.ts';

interface FakeAuthReactRouterAppOptions {
  audience: AppAudience;
  session: Pick<JwtSessionServiceOptions, 'secret' | 'secure'>;
  trustedProxyHops: number;
  extendContext?: (context: RouterContextProvider, request: Request, signal: AbortSignal) => void;
}

export function createFakeAuthReactRouterApp(
  loadBuild: ReactRouterBuildLoader,
  { audience, session, trustedProxyHops, extendContext }: FakeAuthReactRouterAppOptions,
) {
  const sessionService = createJwtSessionService({
    audience: `fphd-${audience}`,
    cookieName: sessionCookieName(audience),
    issuer: 'fphd-auth',
    ...session,
  });

  return createReactRouterApp(loadBuild, {
    backendMiddleware: [
      createFakeAuthRouter({
        audience,
        // Per call rather than once: in development the build is reloaded as routes change.
        isPagePath: async (path) => createPagePathCheck(await loadBuild())(path),
        session: sessionService,
        users: fakeUsersForAudience(audience),
      }),
    ],
    session: createJwtSessionVerifier(sessionService),
    trustedProxyHops,
    // Spread rather than passed directly: exactOptionalPropertyTypes rejects an explicit undefined.
    ...(extendContext === undefined ? {} : { extendContext }),
  });
}
