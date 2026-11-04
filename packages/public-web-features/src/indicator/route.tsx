import { formatDocumentTitle } from '@fphd/ui';
import { type MetaFunction, type ShouldRevalidateFunctionArgs, useLoaderData } from 'react-router';

import { loadIndicator } from './loader.ts';
import { SingleIndicatorPage } from './single-page.tsx';

export const loader = loadIndicator;

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
  { title: formatDocumentTitle(loaderData?.selected[0]?.detail.name ?? 'Indicator') },
];

export function IndicatorRoute() {
  const {
    selected,
    selectedAreas,
    compareAreasData,
    comparedAreasData,
    compareAreaOptions,
    compareAreaGroup,
    displayGroups,
    comparisonDisplayGroups,
    benchmarkGeography,
    findResults,
    findSubject,
    geographyOptions,
    areasLimited,
    selection,
  } = useLoaderData<typeof loader>();
  return (
    <SingleIndicatorPage
      selected={selected}
      selectedAreas={selectedAreas}
      compareAreasData={compareAreasData}
      comparedAreasData={comparedAreasData}
      compareAreaOptions={compareAreaOptions}
      compareAreaGroup={compareAreaGroup}
      displayGroups={displayGroups}
      comparisonDisplayGroups={comparisonDisplayGroups}
      benchmarkGeography={benchmarkGeography}
      findResults={findResults}
      findSubject={findSubject}
      geographyOptions={geographyOptions}
      areasLimited={areasLimited}
      selection={selection}
    />
  );
}

export default IndicatorRoute;
