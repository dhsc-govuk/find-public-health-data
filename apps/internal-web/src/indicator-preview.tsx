import {
  IndicatorPreviewPage,
  indicatorPreviewHandle,
  previewLinks,
  startIndicatorPreview,
} from '@fphd/internal-web-features';
import {
  IndicatorLinksContext,
  loadIndicatorPage,
  SingleIndicatorPage,
} from '@fphd/public-web-features';
import { formatDocumentTitle } from '@fphd/ui';
import { useMemo } from 'react';
import { type LoaderFunctionArgs, type MetaFunction, useLoaderData } from 'react-router';

import { setPreviewPage } from './indicator-preview-page.ts';

export async function loader(args: LoaderFunctionArgs) {
  const { args: previewArgs, preview } = await startIndicatorPreview(args, setPreviewPage);
  return { ...(await loadIndicatorPage(previewArgs)), preview };
}

export const handle = indicatorPreviewHandle;

export const meta: MetaFunction<typeof loader> = ({ loaderData }) => [
  { title: formatDocumentTitle(loaderData?.detail.name ?? 'Indicator preview') },
];

export default function IndicatorPreviewRoute() {
  const { preview, ...page } = useLoaderData<typeof loader>();
  const links = useMemo(() => previewLinks(preview.id), [preview.id]);
  return (
    <IndicatorPreviewPage metadataOnly={page.detail.dataState === 'metadata-only'}>
      <IndicatorLinksContext.Provider value={links}>
        <SingleIndicatorPage {...page} />
      </IndicatorLinksContext.Provider>
    </IndicatorPreviewPage>
  );
}
