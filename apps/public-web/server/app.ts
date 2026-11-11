import { createAcsEmailSender, createBetaAccess } from '@fphd/beta-access';
import { betaAccessContext } from '@fphd/beta-access/context';
import { createApiClient } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import { loggerContext } from '@fphd/web-server/logger-context';
import { createReactRouterApp } from '@fphd/web-server/react-router';
import { forwardedRequestIdHeaders } from '@fphd/web-server/request-id-headers';

import * as config from './config.ts';

// One for the process, so the limit on how often an invitee is emailed holds across requests.
const betaAccess =
  config.betaAccess === undefined
    ? undefined
    : createBetaAccess({
        config: config.betaAccess,
        sendEmail:
          config.betaAccess.email === undefined
            ? undefined
            : createAcsEmailSender(config.betaAccess.email),
      });

export const app = createReactRouterApp(() => import('virtual:react-router/server-build'), {
  trustedProxyHops: config.trustedProxyHops,
  // Per request, so the API logs each call under the page request's id.
  extendContext: (context, request, signal) => {
    context.set(betaAccessContext, betaAccess);
    context.set(
      apiContext,
      createApiClient({
        baseUrl: config.apiUrl,
        headers: forwardedRequestIdHeaders(request),
        logger: context.get(loggerContext),
        signal,
      }),
    );
  },
});
