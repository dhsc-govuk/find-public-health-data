import { isRouteErrorResponse, useRouteError } from 'react-router';

import { type AppNavigationItem, AppShell } from './app-shell.tsx';
import { NotFoundPage, PageIntro } from './content-page.tsx';

interface RootErrorBoundaryProps {
  audience: 'Public' | 'Internal';
  environmentName?: string | undefined;
  navigation: AppNavigationItem[];
  serviceHref?: string | undefined;
}

/**
 * Renders inside AppShell because it replaces the app's default export (which is where
 * AppShell normally comes from) whenever a route error bubbles up with nothing closer to
 * catch it — the root's `Layout` export still wraps it in the HTML document shell.
 */
export function RootErrorBoundary({
  audience,
  environmentName,
  navigation,
  serviceHref,
}: RootErrorBoundaryProps) {
  const error = useRouteError();
  const isNotFound = isRouteErrorResponse(error) && error.status === 404;

  return (
    <AppShell
      audience={audience}
      environmentName={environmentName}
      navigation={navigation}
      serviceHref={serviceHref}
    >
      {isNotFound ? (
        <NotFoundPage />
      ) : (
        <PageIntro title="Sorry, there is a problem with this service">
          <p className="govuk-body">Try again later.</p>
        </PageIntro>
      )}
    </AppShell>
  );
}
