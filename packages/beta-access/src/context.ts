import type { BetaInvitee } from '@fphd/config';
import { createContext } from 'react-router';

export const PRIVATE_BETA_PATH = '/private-beta';
export const PRIVATE_BETA_SIGN_IN_PATH = '/private-beta/sign-in';

/** The outcome of asking for a sign-in link. Every outcome shows the person the same page. */
export type LinkRequest =
  | { outcome: 'sent'; invitee: BetaInvitee }
  // Local and test have no email service, so the page shows the link instead.
  | { outcome: 'shown'; invitee: BetaInvitee; link: string }
  | { outcome: 'already_sent'; invitee: BetaInvitee }
  | { outcome: 'not_invited' };

export type SignIn =
  | { outcome: 'signed_in'; invitee: BetaInvitee; cookie: string }
  | { outcome: 'rejected' };

export interface BetaAccess {
  /** Whether the private beta's end date has passed, so nobody can sign in. */
  hasEnded(): boolean;
  /** The invitee whose access cookie the request carries, if it is valid and they still are. */
  inviteeFor(cookieHeader: string | null): Promise<BetaInvitee | undefined>;
  requestLink(email: string, returnTo: string): Promise<LinkRequest>;
  /** Checks a sign-in link's token and, if it is valid, gives the access cookie to set. */
  signIn(token: string): Promise<SignIn>;
}

/** Set on every request: undefined when the private beta is off and basic auth guards the site. */
export const betaAccessContext = createContext<BetaAccess | undefined>();
