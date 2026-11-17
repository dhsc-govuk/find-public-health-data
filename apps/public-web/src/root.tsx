import '@fphd/ui/styles.scss';

import { AppDocument, AppShell, createDocumentMeta, RootErrorBoundary } from '@fphd/ui';
import { environmentContext } from '@fphd/web-server/environment-context';
import { href, Outlet, useRouteLoaderData } from 'react-router';

import type { Route } from './+types/root';

export const Layout = AppDocument;
export const meta = createDocumentMeta();

export function loader({ context }: Route.LoaderArgs) {
  return { environmentName: context.get(environmentContext) };
}

/**
 * The environment name stays the same for as long as the server runs, so the root loader runs
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

/** The environment the root loader names. The error boundary renders without it if the loader failed. */
function useEnvironmentName() {
  return useRouteLoaderData<typeof loader>('root')?.environmentName;
}

export default function PublicApp() {
  return (
    <AppShell audience="Public" environmentName={useEnvironmentName()} navigation={navigation}>
      <Outlet />
    </AppShell>
  );
}

export function ErrorBoundary() {
  return (
    <RootErrorBoundary
      audience="Public"
      environmentName={useEnvironmentName()}
      navigation={navigation}
    />
  );
}
