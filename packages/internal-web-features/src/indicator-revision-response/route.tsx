import { titleFromPage } from '@fphd/ui';
import { useLoaderData } from 'react-router';

import { sectionBackLinkHandle, useSectionForm } from '../indicator-section-route.ts';
import type { RevisionResponseField } from './field.ts';
import { loadRevisionResponse, type RevisionResponseData, saveRevisionResponse } from './loader.ts';
import { RevisionResponsePage } from './page.tsx';

export const loader = loadRevisionResponse;

export const action = saveRevisionResponse;

export const meta = titleFromPage;

export const handle = sectionBackLinkHandle;

export function RevisionResponseRoute() {
  const { clarificationRequest } = useLoaderData<RevisionResponseData>();

  return (
    <RevisionResponsePage
      clarificationRequest={clarificationRequest}
      {...useSectionForm<RevisionResponseField>()}
    />
  );
}

export default RevisionResponseRoute;
