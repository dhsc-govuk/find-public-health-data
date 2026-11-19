import { createAcsEmailSender, createBetaAccess } from '@fphd/beta-access';
import { betaAccessContext } from '@fphd/beta-access/context';
import { createApiClient } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import { environmentContext } from '@fphd/web-server/environment-context';
import { feedbackMailboxContext } from '@fphd/web-server/feedback-mailbox-context';
import { loggerContext } from '@fphd/web-server/logger-context';
import { createReactRouterApp } from '@fphd/web-server/react-router';
import { forwardedRequestIdHeaders } from '@fphd/web-server/request-id-headers';
import { searchPageSizeContext } from '@fphd/web-server/search-page-size-context';

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
    context.set(environmentContext, config.environmentName);
    context.set(feedbackMailboxContext, config.feedbackMailbox);
    context.set(searchPageSizeContext, config.searchPageSize);
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
