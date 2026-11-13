import {
  areaDisplayGroupListSchema,
  indicatorDetailSchema,
  indicatorPeriodFiltersSchema,
  topicDetailSchema,
  topicSummaryListSchema,
  topicTrendSummarySchema,
} from '@fphd/public-api-features/contract';
import { indicatorSort } from '@fphd/utils/indicator-sort';
import { type ApiClient, type ApiResponseSchema, apiPath } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import { type LoaderFunctionArgs, RouterContextProvider } from 'react-router';
import { areasInGeographyGroup } from '../geography/groups.ts';
import { loadIndicatorTableData } from '../indicator/loader.ts';
import { loadSearch } from '../search/loader.ts';
import { DIMENSIONS } from '../search/url.ts';
import { compactTopicAreaTable, compactTopicDataTable } from './compact-table.ts';
import { DEFAULT_TOPIC_AREA_GROUP, TOPIC_AREA_GROUPS, topicTableSelection } from './data.ts';
import { topicDataKey } from './filters.ts';
import { topicOverviewModel } from './overview-model.ts';
import { topicAreaTableModel, topicDataTableModel } from './table-models.ts';

export type { TopicDetail, TopicSummary } from '@fphd/public-api-features/contract';

/**
 * Kept free of any @fphd/ui import so it can be unit-tested without the jsdom/SSR
 * environment the GOV.UK component library needs.
 */
export async function loadTopics({ context }: LoaderFunctionArgs) {
  return context.get(apiContext).get('/api/topics', topicSummaryListSchema);
}

export async function loadTopicPage(args: LoaderFunctionArgs) {
  const api = args.context.get(apiContext);
  const reads = new Map<object, Map<string, Promise<unknown>>>();
  const sharedApi: ApiClient = {
    ...api,
    get<T>(path: string, schema: ApiResponseSchema<T>): Promise<T> {
      let paths = reads.get(schema);
      if (!paths) {
        paths = new Map();
        reads.set(schema, paths);
      }
      const existing = paths.get(path);
      if (existing) return existing as Promise<T>;
      const pending = api.get(path, schema);
      paths.set(path, pending);
      return pending;
    },
  };
  const context = new RouterContextProvider();
  context.set(apiContext, sharedApi);
  const sharedArgs = { ...args, context };
  const { slug } = args.params;
  if (!slug) throw new Error('loadTopicPage expects a slug param');
  const topic = await sharedApi.get(apiPath`/api/topics/${slug}`, topicDetailSchema);
  const url = new URL(args.request.url);
  indicatorPeriodFiltersSchema.parse(Object.fromEntries(url.searchParams));
  // Filter forms redirect before any streaming response has started.
  if (DIMENSIONS.some(({ param }) => url.searchParams.has(`${param}-add`))) {
    await loadTopic(sharedArgs, url.searchParams.get('tab-topic') === 'areas' ? 'areas' : 'data');
  }
  const overview = loadTopic(sharedArgs, 'overview').then(({ overview }) =>
    overview
      ? {
          search: overview.search,
          trends: overview.trends,
          highlights: topicOverviewModel(overview.selected),
        }
      : null,
  );
  const content = loadTopic(sharedArgs, 'data').then(({ content }) =>
    content
      ? {
          ...content,
          search: topicTableSearch(content.search),
          listing: { sort: content.listing.sort },
          data: {
            selectedAreas: content.data.selectedAreas,
            areasLimited: content.data.areasLimited,
          },
          table: compactTopicDataTable(topicDataTableModel(content.data.selected, topic.slug)),
        }
      : null,
  );
  const areas = loadTopic(sharedArgs, 'areas').then(({ content }) =>
    content
      ? {
          ...content,
          search: topicTableSearch(content.search),
          listing: { sort: content.listing.sort },
          data: {
            selectedAreas: content.data.selectedAreas,
            areasLimited: content.data.areasLimited,
          },
          table: compactTopicAreaTable(
            topicAreaTableModel(content.data.selected, content.data.benchmarkGeography, topic.slug),
          ),
        }
      : null,
  );
  // Settle document data before React Router starts its deferred-data timeout.
  const completed = url.pathname.endsWith('.data')
    ? undefined
    : await Promise.allSettled([overview, content, areas]);
  return {
    topic,
    overview: completed?.[0].status === 'fulfilled' ? completed[0].value : overview,
    content: completed?.[1].status === 'fulfilled' ? completed[1].value : content,
    areas: completed?.[2].status === 'fulfilled' ? completed[2].value : areas,
  };
}

function topicTableSearch(search: Awaited<ReturnType<typeof loadSearch>>) {
  return {
    ...search,
    // Table rows already carry the displayed indicator fields; filters only need the totals.
    searchResult: { ...search.searchResult, indicators: [] },
    facets: { ...search.facets, topics: [] },
  };
}

/**
 * The client turns the API's 404 into a thrown 404 Response, so React Router renders the
 * nearest not-found boundary instead of the page component. It also encodes the slug —
 * React Router decodes %2F inside a single dynamic segment, so an un-encoded slug of
 * '../internal' would normalise the request onto a different API route entirely.
 */
export async function loadTopic(
  args: LoaderFunctionArgs,
  tab = new URL(args.request.url).searchParams.get('tab-topic'),
) {
  const { context, params, request } = args;
  const { slug } = params;

  if (!slug) {
    // `topics/:slug` cannot match without a segment, so reaching here means the route table
    // and this loader have drifted apart — a wiring bug, not a request the user can make.
    throw new Error('loadTopic expects a slug param; check the route that renders it');
  }

  const topic = await context.get(apiContext).get(apiPath`/api/topics/${slug}`, topicDetailSchema);
  const url = new URL(request.url);
  const path = `/topics/${encodeURIComponent(slug)}`;
  if (tab === null || tab === 'overview') {
    const highlighted = async () => {
      const loadedSearch = await loadSearch(args, { topicSlug: slug, path });
      const search = {
        ...loadedSearch,
        gaCodes: loadedSearch.gaCodes.slice(0, 1),
        geoLevels: [] as string[],
      };
      const preferred = topic.content?.highlightedIndicatorIds ?? [];
      const searchIds = search.searchResult.indicators.map(({ shortId }) => shortId);
      const availablePreferred = (
        await Promise.all(
          preferred.map(async (id) => {
            if (searchIds.includes(id)) return id;
            try {
              await context
                .get(apiContext)
                .get(apiPath`/api/indicators/${String(id)}`, indicatorDetailSchema);
              return id;
            } catch (error) {
              if (error instanceof Response && error.status === 404) return null;
              throw error;
            }
          }),
        )
      ).filter((id): id is number => id !== null);
      const highlightIds = [
        ...availablePreferred,
        ...searchIds.filter((id) => !availablePreferred.includes(id)),
      ].slice(0, 4);
      const dataUrl = new URL(request.url);
      dataUrl.search = '';
      for (const id of highlightIds) dataUrl.searchParams.append('is', String(id));
      for (const code of search.gaCodes) dataUrl.searchParams.append('as', code);
      for (const level of search.geoLevels) dataUrl.searchParams.append('als', level);
      const data = highlightIds.length
        ? await loadIndicatorTableData(
            { ...args, params: {}, request: new Request(dataUrl) },
            search.displayGroups,
            false,
            'recentPerSeries',
          )
        : null;
      return { search, selected: data ? topicTableSelection(data.selected) : [] };
    };
    const [overview, trends] = await Promise.all([
      highlighted(),
      context.get(apiContext).get(apiPath`/api/topics/${slug}/trends`, topicTrendSummarySchema),
    ]);
    return { topic, content: null, overview: { ...overview, trends } };
  }
  if (tab !== 'data' && tab !== 'areas') return { topic, content: null, overview: null };
  const requestedGroup = url.searchParams.get('geo') ?? '';
  const summaryGroup = TOPIC_AREA_GROUPS.includes(requestedGroup)
    ? requestedGroup
    : DEFAULT_TOPIC_AREA_GROUP;
  const areaGroups =
    tab === 'areas'
      ? context
          .get(apiContext)
          .get(
            `/api/areas?${TOPIC_AREA_GROUPS.map((group) => `displayGroup=${encodeURIComponent(group)}`).join('&')}`,
            areaDisplayGroupListSchema,
          )
      : Promise.resolve([]);
  const [loadedSearch, groups] = await Promise.all([
    loadSearch(args, {
      topicSlug: slug,
      path,
      complete: true,
      ...(tab === 'areas' ? { geographyGroup: summaryGroup, geographyPreviews: areaGroups } : {}),
    }),
    areaGroups,
  ]);
  const search = loadedSearch;
  const listing = {
    sort: indicatorSort(url.searchParams.get('sort')) ?? 'subtopic-asc',
    indicators: search.searchResult.indicators,
  };
  const dataUrl = new URL(request.url);
  dataUrl.search = '';
  for (const { shortId } of listing.indicators) dataUrl.searchParams.append('is', String(shortId));
  for (const code of search.gaCodes) dataUrl.searchParams.append('as', code);
  if (tab !== 'areas' || search.gaCodes.length === 0) {
    for (const level of search.geoLevels) dataUrl.searchParams.append('als', level);
  }
  const defaultAreas =
    tab === 'areas' &&
    url.searchParams.getAll('ga').length === 0 &&
    url.searchParams.getAll('geo').length === 0;
  const data = await loadIndicatorTableData(
    {
      ...args,
      params: {},
      request: new Request(dataUrl),
    },
    search.displayGroups,
    tab === 'areas',
  );
  return {
    topic,
    overview: null,
    content: {
      dataKey: topicDataKey({ pathname: path, search: url.search }),
      search:
        tab === 'areas'
          ? {
              ...search,
              geographyOptions: {
                ...search.geographyOptions,
                previews: groups.map(({ displayGroup, areas }) => ({
                  name: displayGroup,
                  areas: areasInGeographyGroup(
                    areas,
                    displayGroup === 'Local authorities'
                      ? 'Upper-tier local authorities'
                      : displayGroup,
                  ),
                })),
              },
            }
          : search,
      listing,
      data: { ...data, selected: topicTableSelection(data.selected, tab === 'areas' ? 0 : 5) },
      defaultAreas,
    },
  };
}
