import { GridColumn, GridRow, InsetText, Tabs } from '@fphd/ui';
import { useLocation } from 'react-router';
import { matchingTopics, TopicResults } from '../topic/results.tsx';
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
  const topics = matchingTopics(data.topicResults, data.q);
  const tab = new URLSearchParams(useLocation().search).get('tab-search');
  const extraParams: Record<string, string> =
    tab === 'topics' || tab === 'indicators' ? { 'tab-search': tab } : {};

  return (
    <div className="fphd-wide-layout">
      <div className="fphd-results-header">
        <h1 className="govuk-heading-xl govuk-!-margin-bottom-0">Search for data</h1>
      </div>
      <GridRow className="govuk-!-margin-top-6 govuk-!-margin-bottom-4">
        <GridColumn width="two-thirds">
          <SearchKeywords state={state} extraParams={extraParams} />
        </GridColumn>
      </GridRow>
      <Tabs
        mobileTabs
        linkSelection
        history="push"
        paramKey="tab-search"
        title="Search results"
        items={[
          {
            id: 'search-indicators',
            param: 'indicators',
            label: `Indicators (${data.searchResult.total.toLocaleString()})`,
            content: (
              <GridRow>
                <GridColumn width="one-third">
                  <SearchGeographies
                    search={data}
                    lookupUrl={data.geographyLookupUrl}
                    extraParams={extraParams}
                    replace
                  />
                  <SearchFilterPane
                    includeDataPeriod
                    facets={data.facets}
                    state={state}
                    extraParams={extraParams}
                  />
                </GridColumn>
                <GridColumn width="two-thirds">
                  <SearchResults
                    gaCodes={state.gaCodes}
                    geoLevels={state.geoLevels}
                    searchResult={data.searchResult}
                  />
                </GridColumn>
              </GridRow>
            ),
          },
          {
            id: 'search-topics',
            param: 'topics',
            label: `Topics (${topics.length.toLocaleString()})`,
            content: (
              <>
                <h2
                  aria-atomic="true"
                  aria-live="polite"
                  className="govuk-heading-m govuk-!-margin-top-4"
                >
                  {topics.length.toLocaleString()} {topics.length === 1 ? 'topic' : 'topics'}
                </h2>
                {topics.length ? (
                  <TopicResults columns="three" topics={topics} query={data.q} />
                ) : (
                  <InsetText>No topics match your search terms.</InsetText>
                )}
              </>
            ),
          },
        ]}
      />
    </div>
  );
}
