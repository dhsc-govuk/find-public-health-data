import {
  areaDisplayGroupListSchema,
  areaNeighbourListSchema,
  DEFAULT_INDICATOR_SEARCH_RESULTS,
  type IndicatorAreaData,
  type IndicatorPageDetail,
  indicatorAreaDataListSchema,
  indicatorListResponseSchema,
  indicatorRangeSchema,
  indicatorScatterSchema,
  MAX_AREA_PREVIEW,
  MAX_INDICATOR_QUERY_LENGTH,
  MAX_NEIGHBOUR_AREAS_PER_REQUEST,
} from '@fphd/public-api-features/contract';
import { isOneOf } from '@fphd/utils/is-one-of';
import { tableSummary } from '@fphd/utils/observation-series';
import { type ApiClient, apiPath } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import { pageSearch } from '@fphd/web-server/page-url';
import { type LoaderFunctionArgs, redirect } from 'react-router';
import {
  AREA_COMPARISON_GROUPS,
  AREA_COMPARISON_PARENT_TYPES,
  AREA_NEIGHBOUR_GROUPS,
  areaComparisonOptions,
  type CompareAreaOption,
  highlightedAreaCodes,
  wantsCompareAreaDetail,
  withNeighbours,
} from './area-comparison.ts';
import { englandCode, quintileParam, scatterPair } from './charts/chart-data.ts';
import { loadRankingScatterComparison, loadScatterComparison } from './charts/scatter-loader.ts';
import { compactIndicator } from './compact-data.ts';
import { indicatorComparisonModel } from './comparison-model.ts';
import { loadIndicatorData, type SelectedIndicator } from './loader.ts';
import { indicatorPageContext } from './page-context.ts';
import { isIndicatorSegment, redirectStatus } from './paths.ts';
import { dataPlaceholder } from './placeholders.ts';
import { createSharedGetsClient } from './shared-gets.ts';
import { loadIndicatorTableEntries } from './table-loader.ts';

async function loadIndicatorPageData(args: LoaderFunctionArgs, compactPage = false) {
  const { context, params, request } = args;
  const url = new URL(request.url);

  const slug = params.slug;
  if (!slug || !isIndicatorSegment(slug)) throw new Response('Not Found', { status: 404 });
  // The comparison tab and the geography picker both ask for the indicator's local authorities.
  const api = createSharedGetsClient(context.get(apiContext));
  context.set(apiContext, api);
  const { detailSchema, links } = context.get(indicatorPageContext);
  const routeDetail = await api.get(apiPath`/api/indicators/${slug}`, detailSchema);
  // An old or case-variant address redirects to the canonical one, unless the page is shown at
  // one address whatever the slug, as the preview is.
  const pagePath = links.page(routeDetail.slug);
  if (routeDetail.slug !== slug && pagePath !== links.page(slug))
    throw redirect(`${pagePath}${pageSearch(url)}`, redirectStatus(slug, routeDetail.slug));

  const compareSegment = url.searchParams.get('compareWith');
  if (compareSegment && !isIndicatorSegment(compareSegment)) {
    throw new Response('Not Found', { status: 404 });
  }
  let comparedDetail: IndicatorPageDetail | undefined;
  if (compareSegment) {
    try {
      comparedDetail = await api.get(apiPath`/api/indicators/${compareSegment}`, detailSchema);
    } catch (error) {
      if (!(error instanceof Response) || error.status !== 404) throw error;
      url.searchParams.delete('compareWith');
      throw redirect(`${pagePath}${pageSearch(url)}`, 302);
    }
  }
  if (comparedDetail) {
    if (comparedDetail.shortId === routeDetail.shortId) {
      url.searchParams.delete('compareWith');
      throw redirect(`${pagePath}${pageSearch(url)}`, 302);
    }
    if (comparedDetail.slug !== compareSegment) {
      url.searchParams.set('compareWith', comparedDetail.slug);
      throw redirect(`${pagePath}${pageSearch(url)}`, 302);
    }
  }

  // A preview of a draft with no data to show asks for no data, and shows a placeholder instead.
  // Its address is checked first, as any page's is.
  const placeholder = dataPlaceholder(routeDetail);
  if (placeholder !== null) return { detail: routeDetail, dataPlaceholder: placeholder };

  const groups = api.get(
    `${apiPath`/api/indicators/${routeDetail.slug}/areas`}?limit=${MAX_AREA_PREVIEW}`,
    areaDisplayGroupListSchema,
  );
  const data = groups.then((groups) =>
    loadIndicatorData(args, {
      api,
      page: { detail: routeDetail, compared: compactPage ? undefined : comparedDetail, groups },
      includeFindResults: !compactPage,
    }),
  );
  const comparison = groups.then((groups) =>
    loadIndicatorComparison(api, url, routeDetail, comparedDetail, groups, data),
  );
  return { detail: routeDetail, dataPlaceholder: null, comparedDetail, data, comparison };
}

export async function loadIndicatorPage(args: LoaderFunctionArgs) {
  const page = await loadIndicatorPageData(args, true);
  if (page.dataPlaceholder !== null) return page;
  const data = Promise.resolve(page.data).then((data) => ({
    ...data,
    // The second indicator only appears in the precomputed pair; its history has no client controls.
    selected: data.selected.slice(0, 1).map(compactIndicator),
  }));
  const url = new URL(args.request.url);
  const findSubject =
    url.searchParams.get('find')?.trim().slice(0, MAX_INDICATOR_QUERY_LENGTH) ?? '';
  const findResults = findSubject
    ? args.context
        .get(apiContext)
        .get(
          `/api/indicators?q=${encodeURIComponent(findSubject)}&limit=${DEFAULT_INDICATOR_SEARCH_RESULTS}`,
          indicatorListResponseSchema,
        )
        .then(({ indicators }) => indicators)
    : Promise.resolve([]);
  const comparison = Promise.resolve(page.comparison).then(async (comparison) => {
    const { chartIndicators, scatter, compareAreaRanges } = comparison;
    const selected = chartIndicators.length
      ? chartIndicators
      : await loadIndicatorTableEntries(
          args.context.get(apiContext),
          [page.detail.shortId],
          [englandCode],
          'latestPerSeries',
        );
    return {
      ...indicatorComparisonModel(selected, comparison),
      areaChart: compactIndicator({
        detail: page.detail,
        areaData: tableSummary(selected[0]?.areaData ?? [], 'latest').areaData,
      }),
      compareAreaRanges,
      scatter,
    };
  });
  // Wait for the final models so document HTML includes compact data, comparisons and search results.
  const completed = url.pathname.endsWith('.data')
    ? undefined
    : await Promise.allSettled([data, comparison, findResults]);
  return {
    ...page,
    comparedDetail: page.comparedDetail
      ? {
          shortId: page.comparedDetail.shortId,
          name: page.comparedDetail.name,
          slug: page.comparedDetail.slug,
          unit: page.comparedDetail.unit,
          yearType: page.comparedDetail.yearType,
          dataSource: page.comparedDetail.dataSource,
        }
      : undefined,
    data: completed?.[0].status === 'fulfilled' ? completed[0].value : data,
    comparison: completed?.[1].status === 'fulfilled' ? completed[1].value : comparison,
    findSubject,
    findResults: completed?.[2].status === 'fulfilled' ? completed[2].value : findResults,
  };
}

export async function loadIndicator(args: LoaderFunctionArgs) {
  const page = await loadIndicatorPageData(args);
  if (page.dataPlaceholder !== null) throw new Response('Not Found', { status: 404 });
  const [data, comparison] = await Promise.all([page.data, page.comparison]);
  return { ...data, ...comparison };
}

async function loadIndicatorComparison(
  api: ApiClient,
  url: URL,
  routeDetail: IndicatorPageDetail,
  comparedDetail: IndicatorPageDetail | undefined,
  indicatorGroups: { displayGroup: string }[],
  data: ReturnType<typeof loadIndicatorData>,
) {
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
  let compactScatter: ReturnType<typeof loadScatterComparison>;
  let compareAreasData: IndicatorAreaData[] = [];
  let chartIndicators: SelectedIndicator[] = [];
  let comparedAreasData: IndicatorAreaData[] = [];
  let compareAreaOptions: CompareAreaOption[] = [];
  const detailed = wantsCompareAreaDetail(url.searchParams);
  if (compareAreaGroup) {
    const groupsFor = (slug: string, parentType?: string) =>
      api.get(
        `${apiPath`/api/indicators/${slug}/areas`}?displayGroup=${encodeURIComponent(compareAreaGroup)}${parentType ? `&parentType=${encodeURIComponent(parentType)}` : ''}`,
        areaDisplayGroupListSchema,
      );
    const [groups, otherGroups] = await Promise.all([
      // Elsewhere this is the same request as the table's own, so the two are shared.
      groupsFor(
        routeDetail.slug,
        detailed ? AREA_COMPARISON_PARENT_TYPES[compareAreaGroup] : undefined,
      ),
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
    const anchors =
      detailed && AREA_NEIGHBOUR_GROUPS.has(compareAreaGroup)
        ? highlightedAreaCodes(url.searchParams, compareAreaOptions)
        : [];
    for (let offset = 0; offset < anchors.length; offset += MAX_NEIGHBOUR_AREAS_PER_REQUEST) {
      const codes = anchors.slice(offset, offset + MAX_NEIGHBOUR_AREAS_PER_REQUEST);
      compareAreaOptions = withNeighbours(
        compareAreaOptions,
        await api
          .get(
            `/api/areas/neighbours?${codes.map((code) => `areaCode=${encodeURIComponent(code)}`).join('&')}`,
            areaNeighbourListSchema,
          )
          .catch(() => []),
      );
    }
    const codes = [...compareAreaOptions.map(({ code }) => code), 'E92000001'];
    const loadRanking = (detail: IndicatorPageDetail): Promise<IndicatorAreaData[]> =>
      codes.length
        ? api.get(
            `${apiPath`/api/indicators/${String(detail.shortId)}/ranking`}?${codes.map((code) => `areaCode=${encodeURIComponent(code)}`).join('&')}`,
            indicatorAreaDataListSchema,
          )
        : Promise.resolve([]);
    if (comparedDetail) {
      const [x, y] = scatterPair(
        [{ detail: routeDetail }, { detail: comparedDetail }],
        url.searchParams,
      );
      if (!x || !y) throw new Error('Expected a comparison pair');
      const [primary, secondary] = await Promise.all([
        loadRanking(routeDetail),
        loadRanking(comparedDetail),
      ]);
      compareAreasData = primary;
      comparedAreasData = secondary;
      chartIndicators = [
        { detail: routeDetail, areaData: primary },
        { detail: comparedDetail, areaData: secondary },
      ];
      compactScatter = loadRankingScatterComparison(chartIndicators, url.searchParams);
      if (!compactScatter) {
        try {
          compactScatter = await api.get(
            `/api/indicator-scatter?indicator=${x.detail.shortId}&indicator=${y.detail.shortId}&${codes.map((code) => `areaCode=${encodeURIComponent(code)}`).join('&')}`,
            indicatorScatterSchema,
          );
        } catch (error) {
          if (!(error instanceof Response) || error.status !== 404) throw error;
        }
      }
    } else {
      compareAreasData = await loadRanking(routeDetail);
      chartIndicators = [{ detail: routeDetail, areaData: compareAreasData }];
    }
  } else if (comparedDetail) {
    const { selected } = await data;
    chartIndicators =
      selected.length === 2
        ? selected
        : await loadIndicatorTableEntries(
            api,
            [routeDetail.shortId, comparedDetail.shortId],
            selected[0]?.areaData.map(({ areaCode }) => areaCode) ?? [englandCode],
          );
  }
  const compareAreaRanges =
    compareAreaGroup && url.searchParams.get(quintileParam(routeDetail.shortId)) === 'yes'
      ? (
          await api.get(
            `${apiPath`/api/indicators/${String(routeDetail.shortId)}/range`}?displayGroup=${encodeURIComponent(compareAreaGroup)}`,
            indicatorRangeSchema,
          )
        ).periods
      : [];
  const scatter = comparedDetail
    ? (compactScatter ?? loadScatterComparison(chartIndicators, url.searchParams))
    : undefined;
  return {
    compareAreasData,
    comparedAreasData,
    compareAreaOptions,
    compareAreaGroup,
    comparisonDisplayGroups,
    chartIndicators,
    compareAreaRanges,
    scatter,
  };
}
