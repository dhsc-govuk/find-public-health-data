import {
  type AreaSummary,
  areaDisplayGroupListSchema,
  type IndicatorAreaData,
  type IndicatorDetail,
  indicatorAreaDataListSchema,
  indicatorDetailSchema,
  MAX_AREA_PREVIEW,
} from '@fphd/public-api-features/contract';
import { indicatorPath } from '@fphd/utils/indicator-path';
import { isOneOf } from '@fphd/utils/is-one-of';
import { apiPath } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import { pageSearch } from '@fphd/web-server/page-url';
import { type LoaderFunctionArgs, redirect } from 'react-router';
import { AREA_COMPARISON_GROUPS, areaComparisonOptions } from './area-comparison.ts';
import { loadIndicatorData } from './loader.ts';
import { isIndicatorSegment, redirectStatus } from './paths.ts';

export async function loadIndicatorPage(args: LoaderFunctionArgs) {
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

  const requestedTab = url.searchParams.get('tab-indicator');
  const tab = isOneOf(
    ['indicator', 'areas', 'compare', 'inequalities', 'about'] as const,
    requestedTab,
  )
    ? requestedTab
    : comparedDetail
      ? 'compare'
      : 'indicator';
  const groups =
    tab === 'indicator' || tab === 'areas' || (tab === 'compare' && comparedDetail)
      ? await api.get(
          `${apiPath`/api/indicators/${routeDetail.slug}/areas`}?limit=${MAX_AREA_PREVIEW}`,
          areaDisplayGroupListSchema,
        )
      : [];
  const [data, comparison] = await Promise.all([
    loadIndicatorData(args, {
      page: {
        detail: routeDetail,
        compared: tab === 'compare' ? comparedDetail : undefined,
        groups,
        tab,
      },
    }),
    tab === 'areas' || (tab === 'compare' && comparedDetail)
      ? loadIndicatorComparison(
          args,
          routeDetail,
          tab === 'compare' ? comparedDetail : undefined,
          groups,
        )
      : {
          compareAreasData: [],
          comparedAreasData: [],
          compareAreaOptions: [],
          compareAreaGroup: '',
          comparisonDisplayGroups: [],
        },
  ]);
  return { detail: routeDetail, comparedDetail, data, comparison };
}

export async function loadIndicator(args: LoaderFunctionArgs) {
  const page = await loadIndicatorPage(args);
  return { ...page.data, ...page.comparison };
}

async function loadIndicatorComparison(
  { context, request }: LoaderFunctionArgs,
  routeDetail: IndicatorDetail,
  comparedDetail: IndicatorDetail | undefined,
  indicatorGroups: { displayGroup: string }[],
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
    [compareAreasData, comparedAreasData] = await Promise.all([
      loadRanking(routeDetail),
      comparedDetail ? loadRanking(comparedDetail) : Promise.resolve([]),
    ]);
  }
  return {
    compareAreasData,
    comparedAreasData,
    compareAreaOptions,
    compareAreaGroup,
    comparisonDisplayGroups,
  };
}
