import type { MetaFunction } from 'react-router';

import { serviceName } from './service-name.ts';

export function formatDocumentTitle(pageTitle?: string, { hasErrors = false } = {}) {
  const title = pageTitle ? `${pageTitle} - ${serviceName} - GOV.UK` : `${serviceName} - GOV.UK`;

  return hasErrors ? `Error: ${title}` : title;
}

export function createDocumentMeta(pageTitle?: string): MetaFunction {
  return () => [{ title: formatDocumentTitle(pageTitle) }];
}

/** Meta for a route whose page renders DocumentTitle, so the document keeps a single title. */
export const titleFromPage: MetaFunction = () => [];

interface DocumentTitleProps {
  pageTitle: string;
  hasErrors: boolean;
}

/**
 * The title of a form page, rendered by the page because `meta` cannot see action data. React
 * hoists it into the head, and a route using it exports `titleFromPage` as its `meta`.
 */
export function DocumentTitle({ pageTitle, hasErrors }: DocumentTitleProps) {
  return <title>{formatDocumentTitle(pageTitle, { hasErrors })}</title>;
}
