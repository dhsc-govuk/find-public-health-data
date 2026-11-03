import {
  type AreaSummary,
  areaDisplayGroupListSchema,
  DEFAULT_INDICATOR_SEARCH_RESULTS,
  type IndicatorAreaData,
  type IndicatorDetail,
  type IndicatorSummary,
  indicatorAreaDataListSchema,
  indicatorAreaDataSchema,
  indicatorDetailSchema,
  indicatorListResponseSchema,
  MAX_AREA_CODES_PER_REQUEST,
  MAX_AREA_PREVIEW,
  MAX_INDICATOR_QUERY_LENGTH,
} from '@fphd/public-api-features/contract';
import { indicatorPath } from '@fphd/utils/indicator-path';
import { type ApiClient, apiPath } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import { pageSearch } from '@fphd/web-server/page-url';
import { type LoaderFunctionArgs, redirect } from 'react-router';
import { AREA_COMPARISON_GROUPS, areaComparisonOptions } from './area-comparison.ts';
import { loadInBatches } from './batches.ts';
import { comparisonRows } from './data.ts';
import { DEFAULT_AREA_CODE, loadIndicatorData } from './loader.ts';
import { isIndicatorSegment, redirectStatus } from './paths.ts';
import { indicatorTab } from './view.ts';

export async function loadIndicator(args: LoaderFunctionArgs) {
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

  const tab = indicatorTab(url);
  const compareSegment = tab === 'compare' ? url.searchParams.get('compareWith') : null;
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

  const emptyComparison = {
    compareAreasData: [] as IndicatorAreaData[],
    comparedAreasData: [] as IndicatorAreaData[],
    compareAreaOptions: [] as AreaSummary[],
    compareAreaGroup: '',
    comparisonDisplayGroups: [] as string[],
  };
  const emptySearch = { findSubject: '', findResults: [] as IndicatorSummary[] };
  if (tab === 'indicator' || tab === 'inequalities') {
    const needsGroups = tab === 'indicator' || url.searchParams.has('als');
    const groups = needsGroups
      ? await api.get(
          `${apiPath`/api/indicators/${routeDetail.slug}/areas`}?limit=${tab === 'indicator' ? MAX_AREA_PREVIEW : 1}`,
          areaDisplayGroupListSchema,
        )
      : [];
    const data = await loadIndicatorData(args, { page: { detail: routeDetail, tab, groups } });
    return { ...data, ...emptyComparison, ...emptySearch };
  }

  const loadEngland = async (detail: IndicatorDetail) => ({
    detail,
    areaData: [
      await api.get(
        `${apiPath`/api/indicators/${String(detail.shortId)}/data`}?areaCode=${DEFAULT_AREA_CODE}`,
        indicatorAreaDataSchema,
      ),
    ],
  });
  const findSubject =
    tab === 'compare'
      ? (url.searchParams.get('find')?.trim().slice(0, MAX_INDICATOR_QUERY_LENGTH) ?? '')
      : '';
  const [primary, compared, comparison, findResults] = await Promise.all([
    loadEngland(routeDetail),
    comparedDetail ? loadEngland(comparedDetail) : undefined,
    tab === 'areas' || comparedDetail
      ? loadIndicatorComparison(api, url.searchParams, routeDetail, comparedDetail)
      : emptyComparison,
    findSubject
      ? api
          .get(
            `/api/indicators?q=${encodeURIComponent(findSubject)}&limit=${DEFAULT_INDICATOR_SEARCH_RESULTS}`,
            indicatorListResponseSchema,
          )
          .then(({ indicators }) => indicators)
      : emptySearch.findResults,
  ]);
  return {
    selected: compared ? [primary, compared] : [primary],
    selectedAreas: [],
    displayGroups: [],
    geographyOptions: undefined,
    benchmarkGeography: { regionByCode: {}, levelByCode: {} },
    areasLimited: false,
    selection: {
      areaCodes: [],
      areaLevels: [],
      shortIds: compared ? [routeDetail.shortId, compared.detail.shortId] : [routeDetail.shortId],
    },
    ...comparison,
    findSubject,
    findResults,
  };
}

async function loadIndicatorComparison(
  api: ApiClient,
  params: URLSearchParams,
  primary: IndicatorDetail,
  compared?: IndicatorDetail,
) {
  const groupsFor = (slug: string, query: string) =>
    api.get(`${apiPath`/api/indicators/${slug}/areas`}?${query}`, areaDisplayGroupListSchema);
  const [catalogue, comparedCatalogue] = await Promise.all([
    groupsFor(primary.slug, 'limit=1'),
    compared ? groupsFor(compared.slug, 'limit=1') : undefined,
  ]);
  const comparisonDisplayGroups = catalogue
    .map(({ displayGroup }) => displayGroup)
    .filter(
      (group) =>
        AREA_COMPARISON_GROUPS.has(group) &&
        (!comparedCatalogue ||
          comparedCatalogue.some(({ displayGroup }) => group === displayGroup)),
    );
  const requestedGroup = params.get('areaType') ?? '';
  const compareAreaGroup = comparisonDisplayGroups.includes(requestedGroup)
    ? requestedGroup
    : comparisonDisplayGroups.includes('Local authorities')
      ? 'Local authorities'
      : (comparisonDisplayGroups[0] ?? '');
  const groupQuery = `displayGroup=${encodeURIComponent(compareAreaGroup)}`;
  const [groups, otherGroups] = compareAreaGroup
    ? await Promise.all([
        groupsFor(primary.slug, groupQuery),
        compared ? groupsFor(compared.slug, groupQuery) : undefined,
      ])
    : [[], undefined];
  const otherCodes = otherGroups
    ? new Set(otherGroups.flatMap(({ areas }) => areas.map(({ code }) => code)))
    : undefined;
  const compareAreaOptions = areaComparisonOptions(
    groups.flatMap(({ areas }) => areas).filter(({ code }) => !otherCodes || otherCodes.has(code)),
    compareAreaGroup,
  );
  const codes = compareAreaOptions.map(({ code }) => code);
  const batches = Array.from(
    { length: Math.ceil(codes.length / MAX_AREA_CODES_PER_REQUEST) },
    (_, index) =>
      codes.slice(index * MAX_AREA_CODES_PER_REQUEST, (index + 1) * MAX_AREA_CODES_PER_REQUEST),
  );
  const loadRanking = async (detail: IndicatorDetail) => {
    const data = (
      await loadInBatches(batches, (batch) =>
        api.get(
          `${apiPath`/api/indicators/${String(detail.shortId)}/data`}?${batch.map((code) => `areaCode=${encodeURIComponent(code)}`).join('&')}`,
          batch.length === 1
            ? indicatorAreaDataSchema.transform((one) => [one])
            : indicatorAreaDataListSchema,
        ),
      )
    ).flat();
    const row = comparisonRows([{ detail, areaData: data }])[0];
    const latestPeriod = row?.cells
      .flatMap(({ series }) => series)
      .filter(({ value }) => value !== null)
      .sort((a, b) => b.toDate.localeCompare(a.toDate) || b.fromDate.localeCompare(a.fromDate))[0];
    const latest = new Map(
      row?.cells.map((cell) => [
        cell.areaCode,
        cell.series.findLast(
          ({ value, fromDate, toDate }) =>
            value !== null &&
            fromDate === latestPeriod?.fromDate &&
            toDate === latestPeriod?.toDate,
        ),
      ]),
    );
    return data.map((area) => {
      const observation = latest.get(area.areaCode);
      return { ...area, observations: observation ? [observation] : [] };
    });
  };
  const [compareAreasData, comparedAreasData] = await Promise.all([
    loadRanking(primary),
    compared ? loadRanking(compared) : [],
  ]);
  return {
    compareAreasData,
    comparedAreasData,
    compareAreaOptions,
    compareAreaGroup,
    comparisonDisplayGroups,
  };
}
