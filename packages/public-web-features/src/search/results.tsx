import { formatDate, InsetText, Pagination, Select, SummaryList } from '@fphd/ui';
import { indicatorPath } from '@fphd/utils/indicator-path';
import type { SearchSort } from '@fphd/utils/indicator-sort';
import { expandedPeriodLabel } from '@fphd/utils/period-label';
import { useEffect, useRef } from 'react';
import { Form, Link, useLocation } from 'react-router';
import { HiddenFilters } from './filter-fields.tsx';
import type { IndicatorSearchResult, IndicatorSearchRow } from './loader.ts';
import { searchPageCount } from './pagination.ts';
import { type SearchState, searchUrl } from './url.ts';

/** The navigation state of a page link, which moves focus to the results heading once it loads. */
const FOCUS_RESULTS = 'focusResults';

const SEARCH_SORT_OPTIONS: { value: SearchSort; label: string }[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'recently-updated', label: 'Recently updated' },
];

interface SearchResultsProps {
  searchResult: IndicatorSearchResult;
  gaCodes: string[];
  geoLevels: string[];
  sort: SearchSort;
  state: SearchState;
  extraParams: Record<string, string>;
}

function Tags({ items }: { items: { key: string; label: string }[] }) {
  return (
    <div className="fphd-filter-chips fphd-filter-chips--inline">
      {items.map((item) => (
        <div className="fphd-filter-chip fphd-filter-chip--tag" key={item.key}>
          {item.label}
        </div>
      ))}
    </div>
  );
}

function ResultMeta({ indicator }: { indicator: IndicatorSearchRow }) {
  const classified = (dimension: string) =>
    indicator.classifications
      .filter((c) => c.dimension === dimension)
      .map((c) => ({ key: `${c.dimension}:${c.slug}`, label: c.name }));
  const tagRows = [
    { key: 'Topics', items: indicator.topics.map((t) => ({ key: t.slug, label: t.title })) },
    { key: 'Measure type', items: classified('indicator_type') },
    { key: 'Life stage', items: classified('life_stage') },
  ]
    .filter((row) => row.items.length > 0)
    .map((row) => ({ name: row.key, children: <Tags items={row.items} /> }));
  const dataRows = [
    ...(indicator.latestPeriod
      ? [
          {
            name: 'Most recent period',
            children: expandedPeriodLabel(indicator.latestPeriod, indicator.yearType),
          },
        ]
      : []),
    ...(indicator.dataUpdatedAt
      ? [
          {
            name: 'Data last updated',
            children: (
              <time dateTime={indicator.dataUpdatedAt}>
                {formatDate(indicator.dataUpdatedAt, 'long')}
              </time>
            ),
          },
        ]
      : []),
  ];
  const lists = [tagRows, dataRows].filter((rows) => rows.length > 0);

  if (lists.length === 0) return null;

  return (
    <div className="fphd-search-result__summary">
      {lists.map((rows) => (
        <SummaryList
          className="govuk-!-margin-bottom-0 govuk-!-margin-top-1"
          items={rows}
          key={rows[0]?.name}
        />
      ))}
    </div>
  );
}

export function SearchResults({
  searchResult,
  gaCodes,
  geoLevels,
  sort,
  state,
  extraParams,
}: SearchResultsProps) {
  const { total, limit, indicators, page = 1 } = searchResult;
  const totalPages = searchPageCount(total, limit);
  const heading = useRef<HTMLHeadingElement>(null);
  const location = useLocation();
  const shownLocation = useRef(location.key);
  useEffect(() => {
    if (location.key === shownLocation.current) return;
    shownLocation.current = location.key;
    if (location.state?.[FOCUS_RESULTS] !== true) return;
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: 'start' });
  }, [location]);
  const pageParams = sort === 'relevance' ? extraParams : { ...extraParams, sort };
  // FIXME(FPH-799): NotGovUK Pagination marks the current link from the URL query, not from
  // currentPage, so every link names its page, page 1 included. Drop page=1 once it uses currentPage.
  const pageLink = (n: number) => ({
    href: searchUrl(state, '/search', { ...pageParams, page: String(n) }),
    preventScrollReset: true,
    state: { [FOCUS_RESULTS]: true },
  });
  const geography = new URLSearchParams([
    ...gaCodes.map((code) => ['as', code]),
    ...geoLevels.map((level) => ['als', level]),
  ]).toString();

  return (
    <>
      <div className="fphd-results-sort fphd-search-sort govuk-!-margin-top-4 govuk-!-margin-bottom-3">
        <h2
          className="govuk-heading-m govuk-!-margin-bottom-0"
          id="results-heading"
          ref={heading}
          tabIndex={-1}
        >
          {/* Only the count is live. A page link moves focus to the heading, which reads the
              page number out, so a new page is not announced a second time. */}
          <span aria-atomic="true" aria-live="polite">
            {total.toLocaleString()} {total === 1 ? 'indicator' : 'indicators'}
          </span>
          {totalPages > 1 ? (
            <span className="govuk-visually-hidden">
              , page {page} of {totalPages}
            </span>
          ) : null}
        </h2>
        <Form action="/search" className="fphd-sort-inline" method="get" preventScrollReset>
          <HiddenFilters state={state} extraParams={extraParams} />
          <Select
            id="search-sort"
            label="Sort by"
            name="sort"
            options={SEARCH_SORT_OPTIONS}
            value={sort}
            onChange={(event) => event.currentTarget.form?.requestSubmit()}
          />
          <noscript>
            <button className="govuk-button govuk-button--secondary" type="submit">
              Sort indicators
            </button>
          </noscript>
        </Form>
      </div>

      {indicators.length === 0 ? (
        <InsetText>No indicators match your selected filters or search terms.</InsetText>
      ) : (
        <>
          <ul className="govuk-list fphd-search-results">
            {indicators.map((indicator) => (
              <li className="fphd-search-result" key={indicator.shortId}>
                <Link
                  className="govuk-link fphd-search-result__title"
                  to={`${indicatorPath(indicator.slug)}${geography ? `?${geography}` : ''}`}
                >
                  {indicator.name}
                </Link>
                <ResultMeta indicator={indicator} />
              </li>
            ))}
          </ul>

          {totalPages > 1 ? (
            <Pagination
              currentPage={page}
              landmarkLabel="Search results pages"
              links={Array.from({ length: totalPages }, (_, index) => pageLink(index + 1))}
            />
          ) : null}
        </>
      )}
    </>
  );
}
