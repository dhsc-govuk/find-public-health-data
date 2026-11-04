import { createApiClient } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import { createFakeAuthReactRouterApp } from '@fphd/web-server/fake-auth-react-router';
import { loggerContext } from '@fphd/web-server/logger-context';
import { forwardedRequestIdHeaders } from '@fphd/web-server/request-id-headers';

import * as config from './config.ts';

export const app = createFakeAuthReactRouterApp(() => import('virtual:react-router/server-build'), {
  audience: 'public',
  session: config.session,
  trustedProxyHops: config.trustedProxyHops,
  // Per request, so the API logs each call under the page request's id.
  extendContext: (context, request, signal) =>
    context.set(
      apiContext,
      createApiClient({
        baseUrl: config.apiUrl,
        headers: forwardedRequestIdHeaders(request),
        logger: context.get(loggerContext),
        signal,
      }),
    ),
});
