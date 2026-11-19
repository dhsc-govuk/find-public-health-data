import { encodeReturnTo } from '@fphd/auth';
import { pagePath } from '@fphd/web-server/page-url';
import { type MiddlewareFunction, redirect } from 'react-router';

import { betaAccessContext, PRIVATE_BETA_PATH } from './context.ts';

/**
 * Sends anyone without a valid access cookie to the private beta page, to ask for a link. The page
 * they wanted goes with them, hex-encoded so the gateway lets the address through.
 */
export const betaAccessMiddleware: MiddlewareFunction<Response> = async (
  { context, request },
  next,
) => {
  const betaAccess = context.get(betaAccessContext);
  if (betaAccess === undefined) return next();

  if ((await betaAccess.inviteeFor(request.headers.get('Cookie'))) !== undefined) return next();

  const requestUrl = new URL(request.url);
  const privateBetaUrl = new URL(PRIVATE_BETA_PATH, requestUrl);
  privateBetaUrl.searchParams.set('returnTo', encodeReturnTo(pagePath(requestUrl)));
  throw redirect(`${privateBetaUrl.pathname}${privateBetaUrl.search}`);
};
