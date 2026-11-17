import { normalizeReturnTo } from '@fphd/auth';
import {
  type BetaAccess,
  betaAccessContext,
  type LinkRequest,
  PRIVATE_BETA_PATH,
} from '@fphd/beta-access/context';
import type { Logger } from '@fphd/logger';
import { loggerContext } from '@fphd/web-server/logger-context';
import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  type RouterContextProvider,
  redirect,
} from 'react-router';

export interface PrivateBetaData {
  ended: boolean;
  /** Set when a sign-in link brought them back here because it had expired or was not valid. */
  linkRejected: boolean;
  returnTo: string;
}

export type PrivateBetaRequest =
  | { status: 'invalid'; email: string; error: string }
  // `link` only where there is no email service to send it, in local and test.
  | { status: 'requested'; email: string; link: string | undefined }
  // The email service refused or failed to take the link, so the visitor can try again.
  | { status: 'send_failed'; email: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Off wherever basic auth guards the site instead, so its pages are not there. */
function requireBetaAccess(context: Readonly<RouterContextProvider>): BetaAccess {
  const betaAccess = context.get(betaAccessContext);
  if (betaAccess === undefined) throw new Response('Not Found', { status: 404 });
  return betaAccess;
}

function emailError(email: string): string | undefined {
  if (email === '') return 'Enter your email address';
  if (!EMAIL_PATTERN.test(email)) {
    return 'Enter an email address in the correct format, like name@example.com';
  }
  return undefined;
}

function formText(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}

/**
 * The parts of a failed send's error worth logging, with the invitee's address taken out of its
 * message: the email service's errors can name the recipient, and invitees are logged by label
 * only.
 */
function sendFailure(error: unknown, email: string) {
  const redact = (text: string) => text.replaceAll(email, '[invitee]');
  if (!(error instanceof Error)) return { message: redact(String(error)) };
  const { code, statusCode } = error as { code?: unknown; statusCode?: unknown };
  return { type: error.name, message: redact(error.message), code, statusCode };
}

function logLinkRequest(logger: Logger, request: LinkRequest): void {
  switch (request.outcome) {
    case 'sent':
      logger.info({ invitee: request.invitee.label }, 'Private beta link sent');
      return;
    case 'shown':
      logger.info({ invitee: request.invitee.label }, 'Private beta link shown');
      return;
    case 'already_sent':
      logger.info({ invitee: request.invitee.label }, 'Private beta link not sent: sent recently');
      return;
    case 'domain_limit':
      logger.warn(
        { invitee: request.invitee.label },
        'Private beta link not sent: its domain has had its links for the hour',
      );
      return;
    case 'send_failed':
      logger.error(
        { invitee: request.invitee.label, err: sendFailure(request.error, request.invitee.email) },
        'Private beta link not sent: the email service failed',
      );
      return;
    case 'not_invited':
      logger.info('Private beta link not sent: not invited');
  }
}

export function loadPrivateBeta({ context, request }: LoaderFunctionArgs): PrivateBetaData {
  const betaAccess = requireBetaAccess(context);
  const { searchParams } = new URL(request.url);

  return {
    ended: betaAccess.hasEnded(),
    linkRejected: searchParams.get('link') === 'rejected',
    returnTo: normalizeReturnTo(searchParams.get('returnTo')),
  };
}

export async function requestPrivateBetaLink({
  context,
  request,
}: ActionFunctionArgs): Promise<PrivateBetaRequest> {
  const betaAccess = requireBetaAccess(context);
  const form = await request.formData();
  const email = formText(form, 'email').trim();
  const error = emailError(email);
  if (error !== undefined) return { status: 'invalid', email, error };

  const result = await betaAccess.requestLink(email, formText(form, 'returnTo'));
  logLinkRequest(context.get(loggerContext), result);
  if (result.outcome === 'send_failed') return { status: 'send_failed', email };

  return { status: 'requested', email, link: result.outcome === 'shown' ? result.link : undefined };
}

export async function signInToPrivateBeta({
  context,
  request,
}: LoaderFunctionArgs): Promise<Response> {
  const betaAccess = requireBetaAccess(context);
  const logger = context.get(loggerContext);
  const { searchParams } = new URL(request.url);
  const returnTo = normalizeReturnTo(searchParams.get('returnTo'));
  const result = await betaAccess.signIn(searchParams.get('token') ?? '');

  if (result.outcome === 'signed_in') {
    logger.info({ invitee: result.invitee.label }, 'Private beta sign-in');
    return redirect(returnTo, { headers: { 'Set-Cookie': result.cookie } });
  }

  logger.info('Private beta sign-in link rejected');
  const again = new URLSearchParams({ link: 'rejected', returnTo });
  return redirect(`${PRIVATE_BETA_PATH}?${again}`);
}
