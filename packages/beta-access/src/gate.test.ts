import { RouterContextProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { type BetaAccess, betaAccessContext } from './context.ts';
import { betaAccessMiddleware } from './gate.ts';

const sam = { email: 'sam@example.com', label: 'Research round 1' };

function fakeBetaAccess(validCookie: string): BetaAccess {
  return {
    hasEnded: () => false,
    inviteeFor: async (cookieHeader) => (cookieHeader === validCookie ? sam : undefined),
    requestLink: async () => ({ outcome: 'not_invited' }),
    signIn: async () => ({ outcome: 'rejected' }),
  };
}

async function runGate(
  requestUrl: string,
  { betaAccess, cookie }: { betaAccess?: BetaAccess; cookie?: string } = {},
): Promise<Response> {
  const context = new RouterContextProvider();
  context.set(betaAccessContext, betaAccess);
  const request = new Request(requestUrl, {
    headers: cookie === undefined ? {} : { Cookie: cookie },
  });
  const url = new URL(requestUrl);

  try {
    const result = await betaAccessMiddleware(
      { context, params: {}, pattern: url.pathname, request, url },
      async () => new Response('Page'),
    );
    if (!(result instanceof Response)) throw new Error('The gate returned no response');
    return result;
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
}

describe('betaAccessMiddleware', () => {
  it('lets an invitee with a valid access cookie through', async () => {
    const response = await runGate('https://beta.example.com/topics', {
      betaAccess: fakeBetaAccess('fphd_beta_access=valid'),
      cookie: 'fphd_beta_access=valid',
    });

    await expect(response.text()).resolves.toBe('Page');
  });

  it('sends anyone else to the private beta page, with the page they wanted', async () => {
    const response = await runGate('https://beta.example.com/topics?page=2', {
      betaAccess: fakeBetaAccess('fphd_beta_access=valid'),
      cookie: 'fphd_beta_access=forged',
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/private-beta?returnTo=%2Ftopics%3Fpage%3D2');
  });

  it('gives a data request the page it was for as the return address', async () => {
    const response = await runGate('https://beta.example.com/topics.data?_routes=root', {
      betaAccess: fakeBetaAccess('fphd_beta_access=valid'),
    });

    expect(response.headers.get('Location')).toBe('/private-beta?returnTo=%2Ftopics');
  });

  it('lets everyone through when the private beta is off', async () => {
    const response = await runGate('https://beta.example.com/topics');

    await expect(response.text()).resolves.toBe('Page');
  });
});
