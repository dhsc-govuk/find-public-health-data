import { describe, expect, it } from 'vitest';

import { ACCESS_COOKIE_NAME, createBetaAccess } from './beta-access.ts';
import type { BetaAccess, LinkRequest, SignIn } from './context.ts';
import type { SignInEmail } from './email.ts';

const sam = { email: 'sam@example.com', label: 'Research round 1' };
const alex = { email: 'alex@example.com', label: 'Marvell team' };
const config = {
  invitees: [sam, alex],
  endsAt: new Date('2027-01-31T23:59:59Z'),
  secret: 'a-beta-access-secret-that-is-long-enough',
  secure: true,
  siteUrl: 'https://beta.example.com',
};

function createClock(start: string) {
  let current = new Date(start);
  return {
    now: () => current,
    advance(ms: number) {
      current = new Date(current.getTime() + ms);
    },
  };
}

function createEmailing(options: { invitees?: typeof config.invitees } = {}) {
  const clock = createClock('2026-11-10T09:00:00Z');
  const sent: SignInEmail[] = [];
  const betaAccess = createBetaAccess({
    config: { ...config, invitees: options.invitees ?? config.invitees },
    sendEmail: async (email) => {
      sent.push(email);
    },
    now: clock.now,
  });
  return { betaAccess, clock, sent };
}

function linkIn(email: SignInEmail | undefined): URL {
  const href = email?.plainText.match(/https:\S+/)?.[0];
  if (href === undefined) throw new Error('The email holds no link');
  return new URL(href);
}

function tokenOf(link: URL): string {
  const token = link.searchParams.get('token');
  if (token === null) throw new Error('The link holds no token');
  return token;
}

function signedIn(result: SignIn): Extract<SignIn, { outcome: 'signed_in' }> {
  if (result.outcome !== 'signed_in') throw new Error(`Sign-in was ${result.outcome}`);
  return result;
}

function cookieValue(setCookie: string): string {
  return setCookie.split(';', 1)[0] ?? '';
}

async function signInAs(betaAccess: BetaAccess, sent: SignInEmail[], email: string) {
  await betaAccess.requestLink(email, '/');
  return signedIn(await betaAccess.signIn(tokenOf(linkIn(sent.at(-1)))));
}

describe('createBetaAccess', () => {
  describe('requestLink', () => {
    it('emails an invitee a sign-in link on the site, keeping where they were going', async () => {
      const { betaAccess, sent } = createEmailing();

      const result = await betaAccess.requestLink(' Sam@Example.com ', '/topics?page=2');

      expect(result).toEqual<LinkRequest>({ outcome: 'sent', invitee: sam });
      expect(sent).toHaveLength(1);
      expect(sent[0]?.to).toBe('sam@example.com');
      const link = linkIn(sent[0]);
      expect(link.origin).toBe('https://beta.example.com');
      expect(link.pathname).toBe('/private-beta/sign-in');
      expect(link.searchParams.get('returnTo')).toBe('/topics?page=2');
    });

    it('sends nothing to an address that was not invited', async () => {
      const { betaAccess, sent } = createEmailing();

      await expect(betaAccess.requestLink('someone@example.com', '/')).resolves.toEqual({
        outcome: 'not_invited',
      });
      expect(sent).toHaveLength(0);
    });

    it('sends an invitee at most one link a minute', async () => {
      const { betaAccess, clock, sent } = createEmailing();

      await betaAccess.requestLink(sam.email, '/');
      clock.advance(59_000);
      await expect(betaAccess.requestLink(sam.email, '/')).resolves.toEqual({
        outcome: 'already_sent',
        invitee: sam,
      });
      await betaAccess.requestLink(alex.email, '/');
      clock.advance(1_000);
      await betaAccess.requestLink(sam.email, '/');

      expect(sent.map(({ to }) => to)).toEqual([sam.email, alex.email, sam.email]);
    });

    it('drops a return address that leaves the site', async () => {
      const { betaAccess, sent } = createEmailing();

      await betaAccess.requestLink(sam.email, '//evil.example.com/');

      expect(linkIn(sent[0]).searchParams.get('returnTo')).toBe('/');
    });

    it('shows the link instead when there is no email service', async () => {
      const betaAccess = createBetaAccess({ config, sendEmail: undefined });

      const result = await betaAccess.requestLink(sam.email, '/');

      expect(result).toMatchObject({ outcome: 'shown', invitee: sam });
      if (result.outcome !== 'shown') throw new Error('No link shown');
      expect(new URL(result.link).pathname).toBe('/private-beta/sign-in');
    });

    it('sends nothing once the private beta has ended', async () => {
      const { betaAccess, clock, sent } = createEmailing();

      clock.advance(config.endsAt.getTime() - clock.now().getTime());

      expect(betaAccess.hasEnded()).toBe(true);
      await expect(betaAccess.requestLink(sam.email, '/')).resolves.toEqual({
        outcome: 'not_invited',
      });
      expect(sent).toHaveLength(0);
    });
  });

  describe('signIn', () => {
    it('gives an invitee a secure access cookie for 30 days', async () => {
      const { betaAccess, sent } = createEmailing();

      const { invitee, cookie } = await signInAs(betaAccess, sent, sam.email);

      expect(invitee).toEqual(sam);
      expect(cookie).toMatch(new RegExp(`^${ACCESS_COOKIE_NAME}=[^;]+; `));
      expect(cookie.split('; ').slice(1)).toEqual([
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        'Secure',
        `Max-Age=${30 * 24 * 60 * 60}`,
      ]);
    });

    it('ends the cookie with the private beta when that comes first', async () => {
      const { betaAccess, clock, sent } = createEmailing();
      clock.advance(config.endsAt.getTime() - clock.now().getTime() - 3_600_000);

      const { cookie } = await signInAs(betaAccess, sent, sam.email);

      expect(cookie).toContain('Max-Age=3600');
    });

    it('accepts a link more than once before it expires, and rejects it after 15 minutes', async () => {
      const { betaAccess, clock, sent } = createEmailing();
      await betaAccess.requestLink(sam.email, '/');
      const token = tokenOf(linkIn(sent[0]));

      expect((await betaAccess.signIn(token)).outcome).toBe('signed_in');
      clock.advance(14 * 60_000);
      expect((await betaAccess.signIn(token)).outcome).toBe('signed_in');
      clock.advance(60_000);
      expect(await betaAccess.signIn(token)).toEqual({ outcome: 'rejected' });
    });

    it('rejects a link for someone no longer invited', async () => {
      const first = createEmailing();
      await first.betaAccess.requestLink(sam.email, '/');
      const { betaAccess } = createEmailing({ invitees: [alex] });

      await expect(betaAccess.signIn(tokenOf(linkIn(first.sent[0])))).resolves.toEqual({
        outcome: 'rejected',
      });
    });

    it('rejects an access cookie offered as a link token', async () => {
      const { betaAccess, sent } = createEmailing();
      const { cookie } = await signInAs(betaAccess, sent, sam.email);
      const accessToken = cookieValue(cookie).slice(`${ACCESS_COOKIE_NAME}=`.length);

      await expect(betaAccess.signIn(accessToken)).resolves.toEqual({ outcome: 'rejected' });
    });
  });

  describe('inviteeFor', () => {
    it('is the invitee whose access cookie the request carries', async () => {
      const { betaAccess, sent } = createEmailing();
      const { cookie } = await signInAs(betaAccess, sent, sam.email);

      await expect(betaAccess.inviteeFor(`other=1; ${cookieValue(cookie)}`)).resolves.toEqual(sam);
    });

    it('is no one without a cookie, or with one that is not valid', async () => {
      const { betaAccess } = createEmailing();

      await expect(betaAccess.inviteeFor(null)).resolves.toBe(undefined);
      await expect(betaAccess.inviteeFor(`${ACCESS_COOKIE_NAME}=forged`)).resolves.toBe(undefined);
    });

    it('is no one once the invitee is taken off the list', async () => {
      const first = createEmailing();
      const { cookie } = await signInAs(first.betaAccess, first.sent, sam.email);
      const { betaAccess } = createEmailing({ invitees: [alex] });

      await expect(betaAccess.inviteeFor(cookieValue(cookie))).resolves.toBe(undefined);
    });

    it('is no one once the cookie expires', async () => {
      const { betaAccess, clock, sent } = createEmailing();
      const { cookie } = await signInAs(betaAccess, sent, sam.email);

      clock.advance(30 * 24 * 60 * 60 * 1_000);

      await expect(betaAccess.inviteeFor(cookieValue(cookie))).resolves.toBe(undefined);
    });
  });
});
