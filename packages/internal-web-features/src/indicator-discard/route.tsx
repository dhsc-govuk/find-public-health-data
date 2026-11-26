import { backLinkHandle, createDocumentMeta } from '@fphd/ui';
import { useLoaderData } from 'react-router';

import { indicatorOverviewPath } from '../indicator-overview/paths.ts';
import { discardDraft, loadIndicatorDiscard } from './loader.ts';
import { DISCARD_TITLE, IndicatorDiscardPage } from './page.tsx';

export const loader = loadIndicatorDiscard;

export const action = discardDraft;

export const meta = createDocumentMeta(DISCARD_TITLE);

export const handle = backLinkHandle<Awaited<ReturnType<typeof loader>>>(
  ({ id }) => indicatorOverviewPath(id),
  'Back to indicator overview',
);

export function IndicatorDiscardRoute() {
  return <IndicatorDiscardPage {...useLoaderData<typeof loader>()} />;
}

export default IndicatorDiscardRoute;
