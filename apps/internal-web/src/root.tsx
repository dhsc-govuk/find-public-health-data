import '@fphd/ui/styles.scss';

import { canEditIndicators, canManage } from '@fphd/auth/permissions';
import {
  AppDocument,
  AppShell,
  backLinkFrom,
  createDocumentMeta,
  RootErrorBoundary,
} from '@fphd/ui';
import { environmentContext } from '@fphd/web-server/environment-context';
import { feedbackMailboxContext } from '@fphd/web-server/feedback-mailbox-context';
import { flashMiddleware } from '@fphd/web-server/flash';
import { getSession, sessionMiddleware } from '@fphd/web-server/session';
import { useEffect } from 'react';
import { href, Outlet, useLoaderData, useMatches, useRouteLoaderData } from 'react-router';

import type { Route } from './+types/root';

export const Layout = AppDocument;
export const meta = createDocumentMeta();
export const middleware: Route.MiddlewareFunction[] = [sessionMiddleware, flashMiddleware];

export function loader({ context }: Route.LoaderArgs) {
  const session = getSession(context);

  return {
    canEditIndicators: session !== undefined && canEditIndicators(session),
    canManage: session !== undefined && canManage(session),
    environmentName: context.get(environmentContext),
    feedbackMailbox: context.get(feedbackMailboxContext),
    signedIn: session !== undefined,
  };
}

function navigationFor({
  canEditIndicators,
  canManage,
  signedIn,
}: {
  canEditIndicators: boolean;
  canManage: boolean;
  signedIn: boolean;
}) {
  return [
    ...(canManage ? [{ href: href('/manage'), text: 'Manage' }] : []),
    ...(canEditIndicators ? [{ href: href('/publish/guidance'), text: 'Guidance' }] : []),
    { href: href('/sign-in'), text: signedIn ? 'Account' : 'Sign in' },
  ];
}

/**
 * Reloads a page the browser restores from its back-forward cache when the user goes back or
 * forward. A restored page shows what it showed when the user left it, so a form could still
 * hold answers or hidden values the user has since replaced. Reloading asks the server again.
 *
 * The page is fetched again with a GET rather than reloaded. A page that was the response to a
 * form post, such as the data table upload showing its errors, would otherwise be posted again,
 * and the browser would ask the user to confirm sending the form a second time.
 */
function useReloadWhenRestored() {
  useEffect(() => {
    const reload = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.replace(window.location.href);
    };
    window.addEventListener('pageshow', reload);
    return () => window.removeEventListener('pageshow', reload);
  }, []);
}

export default function InternalApp() {
  const { canEditIndicators, canManage, environmentName, feedbackMailbox, signedIn } =
    useLoaderData<typeof loader>();
  const backLink = backLinkFrom(useMatches());
  useReloadWhenRestored();

  return (
    <AppShell
      audience="Internal"
      environmentName={environmentName}
      feedbackMailbox={feedbackMailbox}
      backHref={backLink?.href}
      backText={backLink?.text}
      navigation={navigationFor({ canEditIndicators, canManage, signedIn })}
      serviceHref={href('/dashboard')}
    >
      <Outlet />
    </AppShell>
  );
}

export function ErrorBoundary() {
  // The root loader may not have run, or may be what failed, so there is no session to read
  // here — the error page shows the signed-out navigation rather than guessing. The environment
  // banner and the feedback address show whenever the loader did run.
  const data = useRouteLoaderData<typeof loader>('root');

  return (
    <RootErrorBoundary
      audience="Internal"
      environmentName={data?.environmentName}
      feedbackMailbox={data?.feedbackMailbox}
      navigation={navigationFor({ canEditIndicators: false, canManage: false, signedIn: false })}
      serviceHref={href('/dashboard')}
    />
  );
}
