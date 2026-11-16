import { EmailClient } from '@azure/communication-email';
import { ManagedIdentityCredential } from '@azure/identity';
import type { BetaAccessConfig } from '@fphd/config';

export interface SignInEmail {
  to: string;
  subject: string;
  plainText: string;
  html: string;
}

export type SendEmail = (email: SignInEmail) => Promise<void>;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function signInEmail(to: string, link: string, linkLifetimeMinutes: number): SignInEmail {
  const expiry = `The link expires in ${linkLifetimeMinutes} minutes. Do not forward this email or share the link.`;
  const ignore = 'If you did not ask to sign in, you can ignore this email.';
  const intro = 'Use this link to sign in to the Find public health data private beta:';

  return {
    to,
    subject: 'Sign in to Find public health data',
    plainText: [intro, link, expiry, ignore].join('\n\n'),
    html: [
      `<p>${intro}</p>`,
      `<p><a href="${escapeHtml(link)}">Sign in to Find public health data</a></p>`,
      `<p>${expiry}</p>`,
      `<p>${ignore}</p>`,
    ].join('\n'),
  };
}

/** Sends through Azure Communication Services, as the app's managed identity. */
export function createAcsEmailSender({
  endpoint,
  senderAddress,
  azureClientId,
}: NonNullable<BetaAccessConfig['email']>): SendEmail {
  const client = new EmailClient(
    endpoint,
    new ManagedIdentityCredential(azureClientId === undefined ? {} : { clientId: azureClientId }),
  );

  return async ({ to, subject, plainText, html }) => {
    // Resolves once the service has accepted the message; delivery carries on without us.
    await client.beginSend({
      senderAddress,
      recipients: { to: [{ address: to }] },
      content: { subject, plainText, html },
    });
  };
}
