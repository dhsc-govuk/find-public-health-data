import { titleFromPage } from '@fphd/ui';
import { type ActionFunctionArgs, useLoaderData } from 'react-router';

import { sectionBackLinkHandle, useSectionForm } from '../indicator-section-route.ts';
import type { FormatAndSourcesPageFormField, FormatAndSourcesPageValues } from './form.ts';
import { loadFormatAndSources, submitFormatAndSources } from './loader.ts';
import { FormatAndSourcesPage } from './page.tsx';

export const loader = loadFormatAndSources;

export const action = (args: ActionFunctionArgs) => submitFormatAndSources(args);

export const meta = titleFromPage;

export const handle = sectionBackLinkHandle;

// After Show sources, an Add or a Remove, the action's answer is the page with its lists changed.
export function FormatAndSourcesRoute() {
  const { providers } = useLoaderData<typeof loader>();

  return (
    <FormatAndSourcesPage
      providers={providers}
      {...useSectionForm<FormatAndSourcesPageFormField, FormatAndSourcesPageValues>()}
    />
  );
}

export default FormatAndSourcesRoute;
