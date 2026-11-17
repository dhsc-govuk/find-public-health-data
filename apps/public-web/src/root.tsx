import '@fphd/ui/styles.scss';

import { AppDocument, AppShell, createDocumentMeta, RootErrorBoundary } from '@fphd/ui';
import { environmentContext } from '@fphd/web-server/environment-context';
import { feedbackMailboxContext } from '@fphd/web-server/feedback-mailbox-context';
import { href, Outlet, useRouteLoaderData } from 'react-router';

import type { Route } from './+types/root';

export const Layout = AppDocument;
export const meta = createDocumentMeta();

export function loader({ context }: Route.LoaderArgs) {
  return {
    environmentName: context.get(environmentContext),
    feedbackMailbox: context.get(feedbackMailboxContext),
  };
}

/**
 * The environment name and feedback mailbox stay the same for as long as the server runs, so the
 * root loader runs
 * once per page load. Without this, every client-side navigation, such as switching a tab, would
 * also request the root's data from the server.
 */
export function shouldRevalidate() {
  return false;
}

const navigation = [
  { href: href('/'), text: 'Home' },
  { href: href('/search'), text: 'Search' },
  { href: href('/topics'), text: 'Topics' },
];

/**
 * The environment name and feedback mailbox from the root loader. The error boundary renders
 * without them if the loader failed.
 */
function useShellSettings() {
  const data = useRouteLoaderData<typeof loader>('root');
  return { environmentName: data?.environmentName, feedbackMailbox: data?.feedbackMailbox };
}

export default function PublicApp() {
  return (
    <AppShell audience="Public" navigation={navigation} {...useShellSettings()}>
      <Outlet />
    </AppShell>
  );
}

export function ErrorBoundary() {
  return <RootErrorBoundary audience="Public" navigation={navigation} {...useShellSettings()} />;
}
