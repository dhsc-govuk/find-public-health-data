import { GridColumn, GridRow } from '@fphd/ui';
import { SearchFilterPane } from './filter-pane.tsx';
import { SearchGeographies } from './geographies.tsx';
import { SearchKeywords } from './keyword-search.tsx';
import type { loadSearchPage } from './loader.ts';
import { SearchResults } from './results.tsx';
import type { SearchState } from './url.ts';

type SearchData = Awaited<ReturnType<typeof loadSearchPage>>;

function stateFrom(data: SearchData): SearchState {
  return {
    q: data.q,
    topics: data.topics,
    indicatorTypes: data.indicatorTypes,
    lifeStages: data.lifeStages,
    frameworks: data.frameworks,
    populations: data.populations,
    inequalities: data.inequalities,
    sources: data.sources,
    valueTypes: data.valueTypes,
    yearTypes: data.yearTypes,
    geoLevels: data.geoLevels,
    gaCodes: data.gaCodes,
    fromYear: data.fromYear,
    toYear: data.toYear,
    updatedWithin: data.updatedWithin,
  };
}

export function SearchPage(data: SearchData) {
  const state = stateFrom(data);

  return (
    <div className="fphd-wide-layout">
      <div className="fphd-results-header">
        <h1 className="govuk-heading-xl govuk-!-margin-bottom-0">Search for data</h1>
      </div>
      <GridRow className="govuk-!-margin-top-6 govuk-!-margin-bottom-4">
        <GridColumn width="two-thirds">
          <SearchKeywords state={state} extraParams={{}} />
        </GridColumn>
      </GridRow>
      <GridRow>
        <GridColumn width="one-third">
          <SearchGeographies search={data} replace />
          <SearchFilterPane includeDataPeriod facets={data.facets} state={state} />
        </GridColumn>
        <GridColumn width="two-thirds">
          <SearchResults
            gaCodes={state.gaCodes}
            geoLevels={state.geoLevels}
            searchResult={data.searchResult}
          />
        </GridColumn>
      </GridRow>
    </div>
  );
}
