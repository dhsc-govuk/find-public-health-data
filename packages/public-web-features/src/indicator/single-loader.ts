import {
  type AreaSummary,
  areaDisplayGroupListSchema,
  type IndicatorAreaData,
  type IndicatorDetail,
  indicatorAreaDataListSchema,
  indicatorAreaDataSchema,
  indicatorDetailSchema,
  MAX_AREA_CODES_PER_REQUEST,
  MAX_AREA_PREVIEW,
} from '@fphd/public-api-features/contract';
import { indicatorPath } from '@fphd/utils/indicator-path';
import { apiPath } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import { pageSearch } from '@fphd/web-server/page-url';
import { type LoaderFunctionArgs, redirect } from 'react-router';
import { AREA_COMPARISON_GROUPS, areaComparisonOptions } from './area-comparison.ts';
import { loadInBatches } from './batches.ts';
import { comparisonRows } from './data.ts';
import { loadIndicatorData, type SelectedIndicator } from './loader.ts';
import { isIndicatorSegment, redirectStatus } from './paths.ts';

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

  const indicatorGroups = await api.get(
    `${apiPath`/api/indicators/${routeDetail.slug}/areas`}?limit=${MAX_AREA_PREVIEW}`,
    areaDisplayGroupListSchema,
  );
  const data = await loadIndicatorData(args, {
    page: { detail: routeDetail, compared: comparedDetail, groups: indicatorGroups },
  });
  const selected = data.selected;
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
  const compareAreaGroup = comparisonDisplayGroups.includes(url.searchParams.get('areaType') ?? '')
    ? (url.searchParams.get('areaType') as string)
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
    const batches = Array.from(
      { length: Math.ceil(codes.length / MAX_AREA_CODES_PER_REQUEST) },
      (_, index) =>
        codes.slice(index * MAX_AREA_CODES_PER_REQUEST, (index + 1) * MAX_AREA_CODES_PER_REQUEST),
    );
    const loadRanking = async (indicator: SelectedIndicator) => {
      const data = (
        await loadInBatches(batches, (batch) =>
          api.get(
            `${apiPath`/api/indicators/${String(indicator.detail.shortId)}/data`}?${batch.map((code) => `areaCode=${encodeURIComponent(code)}`).join('&')}`,
            batch.length === 1
              ? indicatorAreaDataSchema.transform((one) => [one])
              : indicatorAreaDataListSchema,
          ),
        )
      ).flat();
      const row = comparisonRows([{ detail: indicator.detail, areaData: data }])[0];
      const latestPeriod = row?.cells
        .flatMap(({ series }) => series)
        .filter(({ value }) => value !== null)
        .sort(
          (a, b) => b.toDate.localeCompare(a.toDate) || b.fromDate.localeCompare(a.fromDate),
        )[0];
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
    const primary = selected[0];
    const other = selected[1];
    if (primary)
      [compareAreasData, comparedAreasData] = await Promise.all([
        loadRanking(primary),
        other ? loadRanking(other) : Promise.resolve([]),
      ]);
  }
  return {
    ...data,
    compareAreasData,
    comparedAreasData,
    compareAreaOptions,
    compareAreaGroup,
    comparisonDisplayGroups,
  };
}
