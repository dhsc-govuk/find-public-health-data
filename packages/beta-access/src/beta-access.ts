import { normalizeReturnTo } from '@fphd/auth';
import { readCookie } from '@fphd/auth/cookies';
import type { BetaAccessConfig, BetaInvitee, BetaInviteeEntry } from '@fphd/config';

import { type BetaAccess, PRIVATE_BETA_SIGN_IN_PATH } from './context.ts';
import { type SendEmail, signInEmail } from './email.ts';
import { createTokenSigner } from './tokens.ts';

export const ACCESS_COOKIE_NAME = 'fphd_beta_access';

const LINK_LIFETIME_MINUTES = 15;
const ACCESS_LIFETIME_MS = 30 * 24 * 60 * 60 * 1_000;
// Limits each address, to protect an invitee's inbox.
const RESEND_INTERVAL_MS = 60 * 1_000;
// Limits each domain entry. Every address at a listed domain can be sent a link, made-up ones
// included, so without it anyone could have the service send any number of emails to the domain.
const DOMAIN_LINKS_PER_HOUR = 10;
const HOUR_MS = 60 * 60 * 1_000;

interface BetaAccessOptions {
  config: Pick<BetaAccessConfig, 'endsAt' | 'invitees' | 'secret' | 'secure' | 'siteUrl'>;
  /** Undefined in local and test, where each link is shown on the page instead. */
  sendEmail: SendEmail | undefined;
  now?: () => Date;
}

/** Lower-cases and trims an address typed into the form, as the invitee list's addresses are. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Finds the invitee for a normalised address. An entry for the address itself comes first.
 * Otherwise the part after its `@` must equal a listed domain exactly, so a domain entry lets in
 * neither its subdomains nor a longer domain that ends with it. Someone let in by a domain entry
 * is named in the logs by that entry's label.
 */
interface Listed {
  invitee: BetaInvitee;
  /** The domain entry that let the invitee in, unless their address is on the list itself. */
  domain?: string;
}

function inviteeLookup(entries: readonly BetaInviteeEntry[]) {
  const byEmail = new Map<string, BetaInvitee>();
  const labelByDomain = new Map<string, string>();
  for (const entry of entries) {
    if ('email' in entry) byEmail.set(entry.email, entry);
    else labelByDomain.set(entry.domain, entry.label);
  }

  return (email: string): Listed | undefined => {
    const invitee = byEmail.get(email);
    if (invitee !== undefined) return { invitee };

    const at = email.lastIndexOf('@');
    if (at < 1) return undefined;
    const domain = email.slice(at + 1);
    const label = labelByDomain.get(domain);
    return label === undefined ? undefined : { invitee: { email, label }, domain };
  };
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
  const lookUp = inviteeLookup(config.invitees);
  const signer = createTokenSigner(secret);
  // Both limits are held per replica: with more than one, each replica allows its own.
  const lastSentAt = new Map<string, number>();
  // When each link in the past hour was sent, per domain entry, for addresses it let in.
  const domainSentAt = new Map<string, number[]>();

  const hasEnded = () => now() >= endsAt;
  const listed = (email: string | undefined): Listed | undefined =>
    email === undefined || hasEnded() ? undefined : lookUp(email);

  /** Takes one of the domain's links for the past hour, or returns false if none is left. */
  function takeDomainLink(domain: string, at: number): boolean {
    const recent = (domainSentAt.get(domain) ?? []).filter((sentAt) => at - sentAt < HOUR_MS);
    if (recent.length >= DOMAIN_LINKS_PER_HOUR) {
      domainSentAt.set(domain, recent);
      return false;
    }
    domainSentAt.set(domain, [...recent, at]);
    return true;
  }

  function returnDomainLink(domain: string, at: number): void {
    const recent = domainSentAt.get(domain) ?? [];
    const index = recent.indexOf(at);
    if (index !== -1) domainSentAt.set(domain, recent.toSpliced(index, 1));
  }

  return {
    hasEnded,

    async inviteeFor(cookieHeader) {
      const token = readCookie(cookieHeader, ACCESS_COOKIE_NAME);
      if (token === undefined) return undefined;

      return listed(await signer.verify('access', token, now()))?.invitee;
    },

    async requestLink(email, returnTo) {
      const found = listed(normalizeEmail(email));
      if (found === undefined) return { outcome: 'not_invited' };
      const { invitee, domain } = found;

      const issuedAt = now();
      const expiresAt = new Date(issuedAt.getTime() + LINK_LIFETIME_MINUTES * 60 * 1_000);
      const link = new URL(PRIVATE_BETA_SIGN_IN_PATH, siteUrl);
      link.searchParams.set('token', await signer.sign('link', invitee.email, issuedAt, expiresAt));
      link.searchParams.set('returnTo', normalizeReturnTo(returnTo));

      if (sendEmail === undefined) return { outcome: 'shown', invitee, link: link.href };

      const sentAt = issuedAt.getTime();
      const previous = lastSentAt.get(invitee.email);
      if (previous !== undefined && sentAt - previous < RESEND_INTERVAL_MS) {
        return { outcome: 'already_sent', invitee };
      }
      // Both limits are taken before sending, so requests that arrive while this one waits on the
      // email service see them. A failed send gives both back, so the invitee can try again at once.
      if (domain !== undefined && !takeDomainLink(domain, sentAt)) {
        return { outcome: 'domain_limit', invitee };
      }
      lastSentAt.set(invitee.email, sentAt);
      try {
        await sendEmail(signInEmail(invitee.email, link.href, LINK_LIFETIME_MINUTES));
      } catch (error) {
        if (lastSentAt.get(invitee.email) === sentAt) lastSentAt.delete(invitee.email);
        if (domain !== undefined) returnDomainLink(domain, sentAt);
        return { outcome: 'send_failed', invitee, error };
      }
      return { outcome: 'sent', invitee };
    },

    async signIn(token) {
      const issuedAt = now();
      const invitee = listed(await signer.verify('link', token, issuedAt))?.invitee;
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
