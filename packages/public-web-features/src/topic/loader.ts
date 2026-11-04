import {
  areaDisplayGroupListSchema,
  indicatorDetailSchema,
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
import { TOPIC_AREA_GROUPS, topicTableSelection } from './data.ts';
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
  const view = (tab: string) => loadTopic({ ...args, context }, tab);
  const [overview, data, areas] = await Promise.all([
    view('overview'),
    view('data'),
    view('areas'),
  ]);
  return {
    topic: overview.topic,
    overview: overview.overview,
    content: data.content
      ? {
          ...data.content,
          data: {
            selectedAreas: data.content.data.selectedAreas,
            areasLimited: data.content.data.areasLimited,
          },
          table: topicDataTableModel(data.content.data.selected, overview.topic.slug),
        }
      : null,
    areas: areas.content
      ? {
          ...areas.content,
          data: {
            selectedAreas: areas.content.data.selectedAreas,
            areasLimited: areas.content.data.areasLimited,
          },
          table: topicAreaTableModel(
            areas.content.data.selected,
            areas.content.data.benchmarkGeography,
            overview.topic.slug,
          ),
        }
      : null,
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
  const summaryGroup = TOPIC_AREA_GROUPS.includes(url.searchParams.get('geo') ?? '')
    ? (url.searchParams.get('geo') ?? 'NHS regions')
    : 'NHS regions';
  const [loadedSearch, areaGroups] = await Promise.all([
    loadSearch(args, {
      topicSlug: slug,
      path,
      complete: true,
      ...(tab === 'areas' ? { geographyGroup: summaryGroup } : {}),
    }),
    tab === 'areas'
      ? context
          .get(apiContext)
          .get(
            `/api/areas?${TOPIC_AREA_GROUPS.map((group) => `displayGroup=${encodeURIComponent(group)}`).join('&')}`,
            areaDisplayGroupListSchema,
          )
      : Promise.resolve([]),
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
      search:
        tab === 'areas'
          ? {
              ...search,
              geographyOptions: {
                ...search.geographyOptions,
                previews: areaGroups.map(({ displayGroup, areas }) => ({
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
