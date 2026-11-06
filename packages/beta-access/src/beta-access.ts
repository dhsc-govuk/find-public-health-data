import { normalizeReturnTo } from '@fphd/auth';
import { readCookie } from '@fphd/auth/cookies';
import type { BetaAccessConfig, BetaInvitee } from '@fphd/config';

import { type BetaAccess, PRIVATE_BETA_SIGN_IN_PATH } from './context.ts';
import { type SendEmail, signInEmail } from './email.ts';
import { createTokenSigner } from './tokens.ts';

export const ACCESS_COOKIE_NAME = 'fphd_beta_access';

const LINK_LIFETIME_MINUTES = 15;
const ACCESS_LIFETIME_MS = 30 * 24 * 60 * 60 * 1_000;
// Only invitees are ever emailed, so this protects their inboxes rather than the service.
const RESEND_INTERVAL_MS = 60 * 1_000;

interface BetaAccessOptions {
  config: Pick<BetaAccessConfig, 'endsAt' | 'invitees' | 'secret' | 'secure' | 'siteUrl'>;
  /** Undefined in local and test, where each link is shown on the page instead. */
  sendEmail: SendEmail | undefined;
  now?: () => Date;
}

/** The form lower-cases and trims an address as the invitee list does. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function accessCookie(token: string, maxAgeSeconds: number, secure: boolean): string {
  return [
    `${ACCESS_COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    ...(secure ? ['Secure'] : []),
    `Max-Age=${maxAgeSeconds}`,
  ].join('; ');
}

export function createBetaAccess({
  config,
  sendEmail,
  now = () => new Date(),
}: BetaAccessOptions): BetaAccess {
  const { endsAt, secret, secure, siteUrl } = config;
  const invitees = new Map(config.invitees.map((invitee) => [invitee.email, invitee]));
  const signer = createTokenSigner(secret);
  // Held per replica: with more than one, an invitee may get one link a minute from each.
  const lastSentAt = new Map<string, number>();

  const hasEnded = () => now() >= endsAt;
  const listed = (email: string | undefined): BetaInvitee | undefined =>
    email === undefined || hasEnded() ? undefined : invitees.get(email);

  return {
    hasEnded,

    async inviteeFor(cookieHeader) {
      const token = readCookie(cookieHeader, ACCESS_COOKIE_NAME);
      if (token === undefined) return undefined;

      return listed(await signer.verify('access', token, now()));
    },

    async requestLink(email, returnTo) {
      const invitee = listed(normalizeEmail(email));
      if (invitee === undefined) return { outcome: 'not_invited' };

      const issuedAt = now();
      const expiresAt = new Date(issuedAt.getTime() + LINK_LIFETIME_MINUTES * 60 * 1_000);
      const link = new URL(PRIVATE_BETA_SIGN_IN_PATH, siteUrl);
      link.searchParams.set('token', await signer.sign('link', invitee.email, issuedAt, expiresAt));
      link.searchParams.set('returnTo', normalizeReturnTo(returnTo));

      if (sendEmail === undefined) return { outcome: 'shown', invitee, link: link.href };

      const previous = lastSentAt.get(invitee.email);
      if (previous !== undefined && issuedAt.getTime() - previous < RESEND_INTERVAL_MS) {
        return { outcome: 'already_sent', invitee };
      }

      await sendEmail(signInEmail(invitee.email, link.href, LINK_LIFETIME_MINUTES));
      lastSentAt.set(invitee.email, issuedAt.getTime());
      return { outcome: 'sent', invitee };
    },

    async signIn(token) {
      const issuedAt = now();
      const invitee = listed(await signer.verify('link', token, issuedAt));
      if (invitee === undefined) return { outcome: 'rejected' };

      const expiresAt = new Date(
        Math.min(issuedAt.getTime() + ACCESS_LIFETIME_MS, endsAt.getTime()),
      );
      const accessToken = await signer.sign('access', invitee.email, issuedAt, expiresAt);
      const maxAgeSeconds = Math.floor((expiresAt.getTime() - issuedAt.getTime()) / 1_000);

      return {
        outcome: 'signed_in',
        invitee,
        cookie: accessCookie(accessToken, maxAgeSeconds, secure),
      };
    },
  };
}
