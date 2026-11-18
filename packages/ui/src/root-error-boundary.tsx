import { isRouteErrorResponse, type MetaFunction, useRouteError } from 'react-router';

import { type AppNavigationItem, AppShell } from './app-shell.tsx';
import { NotFoundPage, notFoundHeading, PageIntro } from './content-page.tsx';
import { formatDocumentTitle } from './document-title.tsx';

const problemHeading = 'Sorry, there is a problem with the service';

function isNotFound(error: unknown) {
  return isRouteErrorResponse(error) && error.status === 404;
}

/** The heading of the page the root error boundary shows, or undefined when there is no error. */
function errorPageHeading(error: unknown) {
  if (error === null || error === undefined) return undefined;
  return isNotFound(error) ? notFoundHeading : problemHeading;
}

/**
 * The meta for an app's root route. When the root error boundary renders, React Router passes
 * the route error to this function, and the title names the error page's heading. Otherwise the
 * error is null and the title names only the service.
 */
export const rootMeta: MetaFunction = ({ error }) => [
  { title: formatDocumentTitle(errorPageHeading(error)) },
];

interface RootErrorBoundaryProps {
  audience: 'Public' | 'Internal';
  environmentName?: string | undefined;
  feedbackMailbox?: string | undefined;
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
  feedbackMailbox,
  navigation,
  serviceHref,
}: RootErrorBoundaryProps) {
  const error = useRouteError();

  return (
    <AppShell
      audience={audience}
      environmentName={environmentName}
      feedbackMailbox={feedbackMailbox}
      navigation={navigation}
      serviceHref={serviceHref}
    >
      {isNotFound(error) ? (
        <NotFoundPage />
      ) : (
        <PageIntro title={problemHeading}>
          <p className="govuk-body">Try again later.</p>
        </PageIntro>
      )}
    </AppShell>
  );
}
