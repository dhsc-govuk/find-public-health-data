import {
  type AreaSummary,
  areaDisplayGroupListSchema,
  DEFAULT_INDICATOR_SEARCH_RESULTS,
  type IndicatorAreaData,
  type IndicatorDetail,
  indicatorAreaDataListSchema,
  indicatorDetailSchema,
  indicatorListResponseSchema,
  MAX_AREA_PREVIEW,
  MAX_INDICATOR_QUERY_LENGTH,
} from '@fphd/public-api-features/contract';
import { indicatorPath } from '@fphd/utils/indicator-path';
import { isOneOf } from '@fphd/utils/is-one-of';
import { apiPath } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import { pageSearch } from '@fphd/web-server/page-url';
import { type LoaderFunctionArgs, redirect } from 'react-router';
import { AREA_COMPARISON_GROUPS, areaComparisonOptions } from './area-comparison.ts';
import { compactIndicator } from './compact-data.ts';
import { indicatorComparisonModel } from './comparison-model.ts';
import { loadIndicatorData } from './loader.ts';
import { isIndicatorSegment, redirectStatus } from './paths.ts';

async function loadIndicatorPageData(args: LoaderFunctionArgs, compactPage = false) {
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
      page: { detail: routeDetail, compared: compactPage ? undefined : comparedDetail, groups },
      includeFindResults: !compactPage,
    }),
  );
  const comparison = groups.then((groups) =>
    loadIndicatorComparison(args, routeDetail, comparedDetail, groups),
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

export async function loadIndicatorPage(args: LoaderFunctionArgs) {
  const page = await loadIndicatorPageData(args, true);
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
  const comparison = Promise.all([page.comparison, findResults]).then(
    ([comparison, findResults]) => ({
      ...indicatorComparisonModel(
        [
          { detail: page.detail, areaData: comparison.compareAreasData },
          ...(page.comparedDetail
            ? [{ detail: page.comparedDetail, areaData: comparison.comparedAreasData }]
            : []),
        ],
        comparison,
      ),
      findSubject,
      findResults,
    }),
  );
  const completed = page.complete ? await Promise.all([data, comparison]) : undefined;
  return {
    ...page,
    comparedDetail: page.comparedDetail
      ? {
          name: page.comparedDetail.name,
          slug: page.comparedDetail.slug,
          unit: page.comparedDetail.unit,
        }
      : undefined,
    data: completed ? completed[0] : data,
    comparison: completed ? completed[1] : comparison,
  };
}

export async function loadIndicator(args: LoaderFunctionArgs) {
  const page = await loadIndicatorPageData(args);
  const [data, comparison] = await Promise.all([page.data, page.comparison]);
  return { ...data, ...comparison };
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
    const codes = [...compareAreaOptions.map(({ code }) => code), 'E92000001'];
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
