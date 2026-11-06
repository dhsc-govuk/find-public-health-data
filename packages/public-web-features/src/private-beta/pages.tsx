import { PRIVATE_BETA_PATH } from '@fphd/beta-access/context';
import {
  A,
  Button,
  DocumentTitle,
  ErrorSummary,
  InsetText,
  NotificationBanner,
  PageIntro,
  TextInput,
} from '@fphd/ui';

import type { PrivateBetaData, PrivateBetaRequest } from './loader.ts';

function anotherLinkPath(returnTo: string): string {
  return `${PRIVATE_BETA_PATH}?${new URLSearchParams({ returnTo })}`;
}

export function PrivateBetaEndedPage() {
  return (
    <>
      <DocumentTitle hasErrors={false} pageTitle="The private beta has ended" />
      <PageIntro title="The private beta has ended">
        <p className="govuk-body">
          The Find public health data private beta has ended. Thank you for taking part.
        </p>
      </PageIntro>
    </>
  );
}

export function CheckEmailPage({
  email,
  link,
  returnTo,
}: {
  email: string;
  link: string | undefined;
  returnTo: string;
}) {
  return (
    <>
      <DocumentTitle hasErrors={false} pageTitle="Check your email" />
      <PageIntro title="Check your email">
        <p className="govuk-body">
          If <strong>{email}</strong> has been invited to the private beta, we have sent a sign-in
          link to it. The link expires in 15 minutes.
        </p>
        {link === undefined ? null : (
          <InsetText>
            Email is not set up here, so use this link instead: <A href={link}>Sign in</A>
          </InsetText>
        )}
        <p className="govuk-body">
          If you do not get an email, check your spam folder or{' '}
          <A href={anotherLinkPath(returnTo)}>ask for another link</A>.
        </p>
      </PageIntro>
    </>
  );
}

export function RequestLinkPage({
  email = '',
  error,
  linkRejected,
  returnTo,
}: {
  email?: string | undefined;
  error?: string | undefined;
  linkRejected: boolean;
  returnTo: string;
}) {
  return (
    <>
      <DocumentTitle hasErrors={error !== undefined} pageTitle="Sign in to the private beta" />
      <ErrorSummary errors={error === undefined ? [] : [{ name: 'email', message: error }]} />
      {linkRejected ? (
        <NotificationBanner disableAutoFocus>
          That sign-in link has expired or is not valid. Enter your email address to get a new one.
        </NotificationBanner>
      ) : null}
      <PageIntro title="Sign in to the private beta">
        <p className="govuk-body">
          Find public health data is in private beta. Only people who have been invited can use it.
        </p>
        <p className="govuk-body">
          Enter the email address you were invited with and we will send you a link to sign in.
        </p>
        <form method="post" noValidate>
          <input name="returnTo" type="hidden" value={returnTo} />
          <TextInput
            autoComplete="email"
            defaultValue={email}
            error={error}
            label="Email address"
            name="email"
            spellCheck={false}
            type="email"
          />
          <Button preventDoubleClick type="submit">
            Send sign-in link
          </Button>
        </form>
      </PageIntro>
    </>
  );
}

export function PrivateBetaPage({
  data,
  request,
}: {
  data: PrivateBetaData;
  request: PrivateBetaRequest | undefined;
}) {
  if (data.ended) return <PrivateBetaEndedPage />;
  if (request?.status === 'requested') {
    return <CheckEmailPage email={request.email} link={request.link} returnTo={data.returnTo} />;
  }
  return (
    <RequestLinkPage
      email={request?.email}
      error={request?.error}
      linkRejected={data.linkRejected && request === undefined}
      returnTo={data.returnTo}
    />
  );
}
