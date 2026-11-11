import { FilterChip, FilterChips, InsetText, Select } from '@fphd/ui';
import { useMemo } from 'react';
import { Form, useLocation, useNavigation } from 'react-router';
import { DownloadShareData } from '../download-share.tsx';
import { geographyGroupLabel } from '../geography/groups.ts';
import { TOPIC_SORTS, topicColumns } from './data.ts';
import { topicDataKey } from './filters.ts';
import type { loadTopicPage } from './loader.ts';
import { AreaSummariesTable } from './tables/area-summaries-table.tsx';
import { TopicDataTable } from './tables/data-table.tsx';

type TopicPageData = Awaited<ReturnType<typeof loadTopicPage>>;
type TopicData = { topic: TopicPageData['topic'] } & NonNullable<
  Awaited<TopicPageData['content'] | TopicPageData['areas']>
>;

export function TopicListing({ data, areas = false }: { data: TopicData; areas?: boolean }) {
  const { topic, search, listing } = data;
  const location = useLocation();
  const navigation = useNavigation();
  const path = `/topics/${topic.slug}`;
  const tab = areas ? 'areas' : 'data';
  const params = new URLSearchParams(
    navigation.location?.pathname === location.pathname
      ? navigation.location.search
      : location.search,
  );
  params.set('tab-topic', tab);
  const columnKey = new URLSearchParams(
    [...params].filter(([key]) => key === 'columns-topic'),
  ).toString();
  const columns = useMemo(() => topicColumns(new URLSearchParams(columnKey)), [columnKey]);
  const sourceTable = data.table;
  const areaKey = new URLSearchParams([...params].filter(([key]) => key === 'ga')).toString();
  const sameGroup = search.geoLevels.includes(params.get('geo') ?? 'NHS regions');
  const table = useMemo(() => {
    const selectedCodes = new URLSearchParams(areaKey).getAll('ga');
    if (
      sourceTable.kind !== 'areas' ||
      !sameGroup ||
      selectedCodes.length === 0 ||
      !selectedCodes.every((code) => sourceTable.areas.some(({ areaCode }) => areaCode === code))
    )
      return sourceTable;
    const selectedAreas = new Set(selectedCodes);
    return {
      ...sourceTable,
      areas: sourceTable.areas.filter(({ areaCode }) => selectedAreas.has(areaCode)),
      rows: sourceTable.rows.map((row) => ({
        ...row,
        cells: row.cells.filter(({ areaCode }) => selectedAreas.has(areaCode)),
      })),
    };
  }, [sourceTable, areaKey, sameGroup]);
  const total = search.searchResult.total;
  const hasRows = table.rows.length > 0;
  const loading =
    data.dataKey !==
    topicDataKey(
      navigation.location?.pathname === location.pathname ? navigation.location : location,
    );
  return (
    <>
      <div className="fphd-indicator-showing">
        <p className="govuk-body-s govuk-!-margin-bottom-1">Showing:</p>
        <FilterChips>
          <FilterChip value="E92000001">England</FilterChip>
          {search.geoLevels.map((level) => (
            <FilterChip key={level} value={level}>
              {areas ? `All ${geographyGroupLabel(level)}` : level}
            </FilterChip>
          ))}
          {search.gaCodes.map((code) => (
            <FilterChip key={code} value={code}>
              {search.gaAreaNames[code] ?? code}
            </FilterChip>
          ))}
        </FilterChips>
      </div>
      <div className="fphd-results-sort fphd-topic-toolbar govuk-!-margin-bottom-3">
        <h2
          aria-atomic="true"
          aria-live="polite"
          className="govuk-heading-m govuk-!-margin-bottom-0"
        >
          {total.toLocaleString()} {total === 1 ? 'indicator' : 'indicators'}
          {loading ? (
            <span className="govuk-body-s govuk-!-margin-left-2" role="status">
              Updating results…
            </span>
          ) : null}
        </h2>
        {!areas ? (
          <Form action={`${path}#topic-data`} method="get" preventScrollReset>
            {[...params]
              .filter(([key]) => key !== 'sort' && key !== 'page')
              .map(([name, value], index) => (
                <input key={`${name}-${index}`} name={name} type="hidden" value={value} />
              ))}
            <Select
              id={`topic-sort-${tab}`}
              label="Sort by"
              name="sort"
              options={TOPIC_SORTS}
              value={params.get('sort') ?? listing.sort}
              onChange={(event) => event.currentTarget.form?.requestSubmit()}
            />
            <noscript>
              <button className="govuk-button govuk-button--secondary" type="submit">
                Sort indicators
              </button>
            </noscript>
          </Form>
        ) : null}
      </div>
      {hasRows ? (
        <DownloadShareData
          inline
          href={`${path}/table.csv?${params}`}
          allDataHref={`${path}/table.csv?tab-topic=data`}
          downloadLabel="Download filtered data (CSV)"
          allDataLabel="Download all data (CSV)"
        />
      ) : null}
      {search.searchResult.page === undefined &&
      search.searchResult.total > search.searchResult.limit ? (
        <InsetText>
          Showing the first {search.searchResult.limit} indicators. Add filters to narrow the list.
        </InsetText>
      ) : null}
      {listing.sort.startsWith('trend-') ? (
        <p className="govuk-body-s">
          Trend sorting uses England's headline series. Indicators without a calculated trend appear
          last.
        </p>
      ) : null}
      {!hasRows ? (
        <InsetText>No indicators match your selected filters or search terms.</InsetText>
      ) : table.kind === 'areas' ? (
        <>
          {data.data.areasLimited && !data.defaultAreas ? (
            <InsetText>
              Showing the first {data.data.selectedAreas.length} areas. Select fewer areas to change
              which ones are shown.
            </InsetText>
          ) : null}
          <div aria-busy={loading}>
            <AreaSummariesTable model={table} />
          </div>
        </>
      ) : (
        <div aria-busy={loading}>
          <TopicDataTable model={table} title={topic.title} columns={columns} />
        </div>
      )}
    </>
  );
}
