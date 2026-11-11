import { type BetaAccess, betaAccessContext } from '@fphd/beta-access/context';
import { createCapturingLogger } from '@fphd/logger/testing';
import { loggerContext } from '@fphd/web-server/logger-context';
import { RouterContextProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { loadPrivateBeta, requestPrivateBetaLink, signInToPrivateBeta } from './loader.ts';

const sam = { email: 'sam@example.com', label: 'Research round 1' };

function setUp(overrides: Partial<BetaAccess> = {}, enabled = true) {
  const { logger, lines } = createCapturingLogger('public-web');
  const requested: Array<{ email: string; returnTo: string }> = [];
  const betaAccess: BetaAccess = {
    hasEnded: () => false,
    inviteeFor: async () => undefined,
    requestLink: async (email, returnTo) => {
      requested.push({ email, returnTo });
      return email === sam.email ? { outcome: 'sent', invitee: sam } : { outcome: 'not_invited' };
    },
    signIn: async (token) =>
      token === 'valid'
        ? { outcome: 'signed_in', invitee: sam, cookie: 'fphd_beta_access=access; Path=/' }
        : { outcome: 'rejected' },
    ...overrides,
  };
  const context = new RouterContextProvider();
  context.set(betaAccessContext, enabled ? betaAccess : undefined);
  context.set(loggerContext, logger);
  return { context, lines, requested };
}

function args(context: RouterContextProvider, url: string, form?: Record<string, string>) {
  const request =
    form === undefined
      ? new Request(url)
      : new Request(url, { method: 'POST', body: new URLSearchParams(form) });
  return { context, params: {}, pattern: new URL(url).pathname, request, url: new URL(url) };
}

async function thrown(run: () => unknown): Promise<Response> {
  try {
    await run();
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
  throw new Error('Nothing was thrown');
}

const page = 'https://beta.example.com/private-beta';

describe('loadPrivateBeta', () => {
  it('keeps where the visitor was going, and whether a link brought them back', () => {
    const { context } = setUp();

    expect(loadPrivateBeta(args(context, `${page}?returnTo=%2Ftopics&link=rejected`))).toEqual({
      ended: false,
      linkRejected: true,
      returnTo: '/topics',
    });
  });

  it('drops a return address that leaves the site', () => {
    const { context } = setUp();

    expect(loadPrivateBeta(args(context, `${page}?returnTo=%2F%2Fevil.example.com`))).toEqual({
      ended: false,
      linkRejected: false,
      returnTo: '/',
    });
  });

  it('says when the private beta has ended', () => {
    const { context } = setUp({ hasEnded: () => true });

    expect(loadPrivateBeta(args(context, page)).ended).toBe(true);
  });

  it('is not found when the private beta is off', async () => {
    const { context } = setUp({}, false);

    expect((await thrown(() => loadPrivateBeta(args(context, page)))).status).toBe(404);
  });
});

describe('requestPrivateBetaLink', () => {
  it('asks for a link for the address entered, logging the invitee by label only', async () => {
    const { context, lines, requested } = setUp();

    const result = await requestPrivateBetaLink(
      args(context, page, { email: ' sam@example.com ', returnTo: '/topics' }),
    );

    expect(result).toEqual({ status: 'requested', email: 'sam@example.com', link: undefined });
    expect(requested).toEqual([{ email: 'sam@example.com', returnTo: '/topics' }]);
    expect(lines).toMatchObject([{ invitee: 'Research round 1', msg: 'Private beta link sent' }]);
    expect(JSON.stringify(lines)).not.toContain('sam@example.com');
  });

  it('answers an address that was not invited exactly as it answers one that was', async () => {
    const { context, lines } = setUp();

    const result = await requestPrivateBetaLink(
      args(context, page, { email: 'someone@example.com', returnTo: '/' }),
    );

    expect(result).toEqual({ status: 'requested', email: 'someone@example.com', link: undefined });
    expect(lines).toMatchObject([{ msg: 'Private beta link not sent: not invited' }]);
    expect(JSON.stringify(lines)).not.toContain('someone@example.com');
  });

  it('passes on the link to show when there is no email service', async () => {
    const link = 'http://localhost:3000/private-beta/sign-in?token=abc';
    const { context } = setUp({
      requestLink: async () => ({ outcome: 'shown', invitee: sam, link }),
    });

    await expect(
      requestPrivateBetaLink(args(context, page, { email: sam.email, returnTo: '/' })),
    ).resolves.toEqual({ status: 'requested', email: sam.email, link });
  });

  it.each([
    ['', 'Enter your email address'],
    ['not-an-address', 'Enter an email address in the correct format, like name@example.com'],
  ])('refuses %j without asking for a link', async (email, error) => {
    const { context, requested } = setUp();

    await expect(
      requestPrivateBetaLink(args(context, page, { email, returnTo: '/' })),
    ).resolves.toEqual({ status: 'invalid', email, error });
    expect(requested).toEqual([]);
  });
});

describe('signInToPrivateBeta', () => {
  const signIn = 'https://beta.example.com/private-beta/sign-in';

  it('sets the access cookie and returns the invitee to where they were going', async () => {
    const { context, lines } = setUp();

    const response = await signInToPrivateBeta(
      args(context, `${signIn}?token=valid&returnTo=%2Ftopics`),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/topics');
    expect(response.headers.get('Set-Cookie')).toBe('fphd_beta_access=access; Path=/');
    expect(lines).toMatchObject([{ invitee: 'Research round 1', msg: 'Private beta sign-in' }]);
  });

  it('never returns the invitee off the site', async () => {
    const { context } = setUp();

    const response = await signInToPrivateBeta(
      args(context, `${signIn}?token=valid&returnTo=https%3A%2F%2Fevil.example.com`),
    );

    expect(response.headers.get('Location')).toBe('/');
  });

  it('sends a rejected link back to ask for another, keeping where they were going', async () => {
    const { context, lines } = setUp();

    const response = await signInToPrivateBeta(
      args(context, `${signIn}?token=expired&returnTo=%2Ftopics`),
    );

    expect(response.headers.get('Location')).toBe('/private-beta?link=rejected&returnTo=%2Ftopics');
    expect(response.headers.get('Set-Cookie')).toBe(null);
    expect(lines).toMatchObject([{ msg: 'Private beta sign-in link rejected' }]);
  });
});
