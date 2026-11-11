import {
  type AreaSummary,
  areaDisplayGroupListSchema,
  type IndicatorAreaData,
  type IndicatorDetail,
  indicatorAreaDataListSchema,
  indicatorDetailSchema,
  indicatorRangeSchema,
  MAX_AREA_PREVIEW,
} from '@fphd/public-api-features/contract';
import { indicatorPath } from '@fphd/utils/indicator-path';
import { isOneOf } from '@fphd/utils/is-one-of';
import { type ApiClient, type ApiResponseSchema, apiPath } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import { pageSearch } from '@fphd/web-server/page-url';
import { type LoaderFunctionArgs, redirect } from 'react-router';
import {
  AREA_COMPARISON_GROUPS,
  areaComparisonOptions,
  comparisonRankingData,
} from './area-comparison.ts';
import { englandCode, quintileParam } from './charts/chart-data.ts';
import { loadScatterComparison } from './charts/scatter-loader.ts';
import { loadIndicatorData, type SelectedIndicator } from './loader.ts';
import { isIndicatorSegment, redirectStatus } from './paths.ts';
import { loadIndicatorTableEntries } from './table-loader.ts';

export async function loadIndicatorPage(args: LoaderFunctionArgs) {
  const originalApi = args.context.get(apiContext);
  const reads = new Map<object, Map<string, Promise<unknown>>>();
  const sharedApi: ApiClient = {
    ...originalApi,
    get<T>(path: string, schema: ApiResponseSchema<T>): Promise<T> {
      let paths = reads.get(schema);
      if (!paths) {
        paths = new Map();
        reads.set(schema, paths);
      }
      const pending = paths.get(path);
      if (pending) return pending as Promise<T>;
      const loaded = originalApi.get(path, schema);
      paths.set(path, loaded);
      return loaded;
    },
  };
  // The request's own context, so its other values reach the loaders unchanged.
  args.context.set(apiContext, sharedApi);
  const { context, params, request } = args;
  const url = new URL(request.url);

  const slug = params.slug;
  if (!slug || !isIndicatorSegment(slug)) throw new Response('Not Found', { status: 404 });
  const api = context.get(apiContext);
  const routeDetail = await api.get(apiPath`/api/indicators/${slug}`, indicatorDetailSchema);
  if (routeDetail.slug !== slug)
    throw redirect(
      `${indicatorPath(routeDetail.slug)}${pageSearch(url)}`,
      redirectStatus(slug, routeDetail.slug),
    );

  const compareSegment = url.searchParams.get('compareWith');
  if (compareSegment && !isIndicatorSegment(compareSegment)) {
    throw new Response('Not Found', { status: 404 });
  }
  let comparedDetail: IndicatorDetail | undefined;
  if (compareSegment) {
    try {
      comparedDetail = await api.get(
        apiPath`/api/indicators/${compareSegment}`,
        indicatorDetailSchema,
      );
    } catch (error) {
      if (!(error instanceof Response) || error.status !== 404) throw error;
      url.searchParams.delete('compareWith');
      throw redirect(`${indicatorPath(routeDetail.slug)}${pageSearch(url)}`, 302);
    }
  }
  if (comparedDetail) {
    if (comparedDetail.shortId === routeDetail.shortId) {
      url.searchParams.delete('compareWith');
      throw redirect(`${indicatorPath(routeDetail.slug)}${pageSearch(url)}`, 302);
    }
    if (comparedDetail.slug !== compareSegment) {
      url.searchParams.set('compareWith', comparedDetail.slug);
      throw redirect(`${indicatorPath(routeDetail.slug)}${pageSearch(url)}`, 302);
    }
  }

  const groups = api.get(
    `${apiPath`/api/indicators/${routeDetail.slug}/areas`}?limit=${MAX_AREA_PREVIEW}`,
    areaDisplayGroupListSchema,
  );
  const data = groups.then((groups) =>
    loadIndicatorData(args, {
      page: { detail: routeDetail, compared: comparedDetail, groups },
    }),
  );
  const comparison = groups.then((groups) =>
    loadIndicatorComparison(args, routeDetail, comparedDetail, groups, data),
  );
  const complete = url.searchParams.get('render') === 'complete';
  const completed = complete ? await Promise.all([data, comparison]) : undefined;
  return {
    detail: routeDetail,
    comparedDetail,
    data: completed ? completed[0] : data,
    comparison: completed ? completed[1] : comparison,
    complete,
  };
}

export async function loadIndicator(args: LoaderFunctionArgs) {
  const page = await loadIndicatorPage(args);
  const [data, comparison] = await Promise.all([page.data, page.comparison]);
  return { ...data, ...comparison };
}

async function loadIndicatorComparison(
  { context, request }: LoaderFunctionArgs,
  routeDetail: IndicatorDetail,
  comparedDetail: IndicatorDetail | undefined,
  indicatorGroups: { displayGroup: string }[],
  data: ReturnType<typeof loadIndicatorData>,
) {
  const api = context.get(apiContext);
  const url = new URL(request.url);
  const catalogueGroups = indicatorGroups.map(({ displayGroup }) => displayGroup);
  const comparisonGroups = comparedDetail
    ? await api.get(
        `${apiPath`/api/indicators/${comparedDetail.slug}/areas`}?limit=1`,
        areaDisplayGroupListSchema,
      )
    : undefined;
  const sharedGroups = comparisonGroups
    ? catalogueGroups.filter((group) =>
        comparisonGroups.some(({ displayGroup }) => displayGroup === group),
      )
    : catalogueGroups;
  const comparisonDisplayGroups = sharedGroups.filter((group) => AREA_COMPARISON_GROUPS.has(group));
  const requestedAreaGroup = url.searchParams.get('areaType');
  const compareAreaGroup = isOneOf(comparisonDisplayGroups, requestedAreaGroup)
    ? requestedAreaGroup
    : comparisonDisplayGroups.includes('Local authorities')
      ? 'Local authorities'
      : (comparisonDisplayGroups[0] ?? '');
  let compareAreasData: IndicatorAreaData[] = [];
  let comparisonHistories: SelectedIndicator[] = [];
  let comparedAreasData: IndicatorAreaData[] = [];
  let compareAreaOptions: AreaSummary[] = [];
  if (compareAreaGroup) {
    const groupsFor = (slug: string) =>
      api.get(
        `${apiPath`/api/indicators/${slug}/areas`}?displayGroup=${encodeURIComponent(compareAreaGroup)}`,
        areaDisplayGroupListSchema,
      );
    const [groups, otherGroups] = await Promise.all([
      groupsFor(routeDetail.slug),
      comparedDetail ? groupsFor(comparedDetail.slug) : Promise.resolve(undefined),
    ]);
    const otherCodes = otherGroups
      ? new Set(otherGroups.flatMap(({ areas }) => areas.map(({ code }) => code)))
      : undefined;
    compareAreaOptions = areaComparisonOptions(
      groups
        .flatMap(({ areas }) => areas)
        .filter(({ code }) => !otherCodes || otherCodes.has(code)),
      compareAreaGroup,
    );
    const codes = compareAreaOptions.map(({ code }) => code);
    const loadRanking = (detail: IndicatorDetail): Promise<IndicatorAreaData[]> =>
      codes.length
        ? api.get(
            `${apiPath`/api/indicators/${String(detail.shortId)}/ranking`}?${codes.map((code) => `areaCode=${encodeURIComponent(code)}`).join('&')}`,
            indicatorAreaDataListSchema,
          )
        : Promise.resolve([]);
    if (comparedDetail) {
      comparisonHistories = await loadIndicatorTableEntries(
        api,
        [routeDetail.shortId, comparedDetail.shortId],
        codes,
      );
      compareAreasData = comparisonHistories[0]
        ? comparisonRankingData(comparisonHistories[0])
        : [];
      comparedAreasData = comparisonHistories[1]
        ? comparisonRankingData(comparisonHistories[1])
        : [];
    } else {
      compareAreasData = await loadRanking(routeDetail);
    }
  }
  const { selected } = await data;
  const primary = selected[0];
  const compareAreaRanges =
    compareAreaGroup && url.searchParams.get(quintileParam(routeDetail.shortId)) === 'yes'
      ? (primary?.ranges?.[compareAreaGroup] ??
        (
          await api.get(
            `${apiPath`/api/indicators/${String(routeDetail.shortId)}/range`}?displayGroup=${encodeURIComponent(compareAreaGroup)}`,
            indicatorRangeSchema,
          )
        ).periods)
      : [];
  const scatter = comparedDetail
    ? loadScatterComparison(
        selected.map((entry) => ({
          ...entry,
          areaData: [
            ...(comparisonHistories.find(({ detail }) => detail.shortId === entry.detail.shortId)
              ?.areaData ?? []),
            ...entry.areaData.filter(({ areaCode }) => areaCode === englandCode),
          ],
        })),
        url.searchParams,
      )
    : undefined;
  return {
    compareAreasData,
    comparedAreasData,
    compareAreaOptions,
    compareAreaGroup,
    comparisonDisplayGroups,
    compareAreaRanges,
    scatter,
  };
}
