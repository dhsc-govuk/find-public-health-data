import { formatDocumentTitle } from '@fphd/ui';
import { type MetaFunction, type ShouldRevalidateFunctionArgs, useLoaderData } from 'react-router';
import { loadIndicatorPage } from './single-loader.ts';
import { SingleIndicatorPage } from './single-page.tsx';

export const loader = loadIndicatorPage;

// Changing a display option only re-renders with data the page already has; benchmark
// options (`cmp-`, `cr-`) are not listed because they decide what the loader fetches.
const DISPLAY_OPTION_PARAM = /^(ci|pt|sex|ic|ip|ig|columns)-/;
const AREA_DISPLAY_OPTIONS = new Set(['areaSort', 'areaColour', 'highlight', 'tab-indicator']);

export function shouldRevalidate({ currentUrl, nextUrl }: ShouldRevalidateFunctionArgs) {
  const strip = (url: URL) => {
    const params = new URLSearchParams(url.search);
    for (const key of [...params.keys()]) {
      if (DISPLAY_OPTION_PARAM.test(key) || AREA_DISPLAY_OPTIONS.has(key)) {
        params.delete(key);
      }
    }
    return `${url.pathname}?${params.toString()}`;
  };
  return strip(currentUrl) !== strip(nextUrl);
}

export const meta: MetaFunction<typeof loader> = ({ loaderData }) => [
  { title: formatDocumentTitle(loaderData?.detail.name ?? 'Indicator') },
];

export function IndicatorRoute() {
  const data = useLoaderData<typeof loader>();
  return <SingleIndicatorPage {...data} />;
}

export default IndicatorRoute;
