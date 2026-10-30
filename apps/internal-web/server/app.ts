import { sessionCookieName } from '@fphd/auth';
import { devToolsContext } from '@fphd/internal-web-features';
import { createApiClient, forwardedCookieHeaders } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import { createFakeAuthReactRouterApp } from '@fphd/web-server/fake-auth-react-router';
import { createFlashSessionStorage, setFlashStorage } from '@fphd/web-server/flash';
import { forwardedRequestIdHeaders } from '@fphd/web-server/request-id-headers';

import * as config from './config.ts';

const audience = 'internal';
const flashStorage = createFlashSessionStorage({ audience, ...config.webSession });

export const app = createFakeAuthReactRouterApp(() => import('virtual:react-router/server-build'), {
  audience,
  session: config.session,
  trustedProxyHops: config.trustedProxyHops,
  extendContext: (context, request) => {
    // Per request: the caller's session cookie, none of the browser's others, and the request
    // id, so the API line and this one read as one flow.
    context.set(
      apiContext,
      createApiClient({
        baseUrl: config.apiUrl,
        uploadTimeoutMs: config.apiUploadTimeoutMs,
        headers: {
          ...forwardedCookieHeaders(request.headers.cookie, sessionCookieName(audience)),
          ...forwardedRequestIdHeaders(request),
        },
      }),
    );
    setFlashStorage(context, flashStorage);
    context.set(devToolsContext, config.offersDevTools);
  },
});
