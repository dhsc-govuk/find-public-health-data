import {
  areaDisplayGroupListSchema,
  areaLookupListSchema,
  areaParentListSchema,
  indicatorAreaDataListSchema,
  indicatorAreaDataSchema,
  MAX_AREA_CODES_PER_REQUEST,
} from '@fphd/public-api-features/contract';
import { isOneOf } from '@fphd/utils/is-one-of';
import { type ApiClient, apiPath } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import { pageSearch } from '@fphd/web-server/page-url';
import { type LoaderFunctionArgs, redirect } from 'react-router';
import { areaTypeLabel } from '../geography/groups.ts';
import { MAX_SELECTED_AREAS } from '../selection-limits.ts';
import { benchmarkMemberships, loadBenchmarkData } from './benchmark-loader.ts';
import { isRangeBenchmark, selectedBenchmarks } from './benchmarks.ts';
import {
  availableConfidenceLevels,
  availableMeasures,
  availablePeriodTypes,
  type ConfidenceLevel,
  dimensionValues,
  filterObservations,
  type PeriodType,
} from './data.ts';
import { allDataCsv, trendCsv } from './download.ts';
import type { BenchmarkGeography, IndicatorAreaData } from './loader.ts';
import { englandObservations, noEnglandLevel } from './no-england.ts';
import { indicatorPageContext } from './page-context.ts';
import { ENGLAND_CODE, isIndicatorSegment, redirectStatus, requestedAreaCodes } from './paths.ts';
import { dataPlaceholder } from './placeholders.ts';
import { selectedTrendColumns, trendTableModel } from './trend.ts';
import { loadIndicatorViewCsv } from './view-csv.ts';

/**
 * Serves the indicator page's downloads server-side, so they work without scripting.
 * The link carries the page's selected areas and trend-table options.
 */
export async function loadIndicatorCsv(
  args: LoaderFunctionArgs,
  kind: 'table' | 'all-data',
): Promise<Response> {
  const { context, params, request } = args;
  const segment = params.slug;
  if (segment === undefined || !isIndicatorSegment(segment)) {
    throw new Response('Not Found', { status: 404 });
  }

  const url = new URL(request.url);
  let pickedCodes = requestedAreaCodes(url.searchParams).slice(0, MAX_SELECTED_AREAS);
  const codesToLoad = [...pickedCodes, ENGLAND_CODE];
  const api = context.get(apiContext);
  const dataFor = (codes: string[]) =>
    api.get(
      `${apiPath`/api/indicators/${segment}/data`}?${codes
        .map((code) => `areaCode=${encodeURIComponent(code)}`)
        .join('&')}`,
      codes.length === 1
        ? indicatorAreaDataSchema.transform((one) => [one])
        : indicatorAreaDataListSchema,
    );
  // The download shares the page's address, so it shares the page's one canonical form:
  // an old address is answered with the redirect before any data is asked for.
  const { detailSchema, links } = context.get(indicatorPageContext);
  const detail = await api.get(apiPath`/api/indicators/${segment}`, detailSchema);
  const csvPath = links.csv(detail.slug, kind);
  if (detail.slug !== segment && csvPath !== links.csv(segment, kind)) {
    throw redirect(`${csvPath}${pageSearch(url)}`, redirectStatus(segment, detail.slug));
  }
  // A preview's draft with no data to show has no downloads.
  if (dataPlaceholder(detail) !== null) throw new Response('Not Found', { status: 404 });
  if (
    kind === 'table' &&
    ['areas', 'compare', 'inequalities'].includes(url.searchParams.get('tab-indicator') ?? '')
  ) {
    return loadIndicatorViewCsv(args);
  }
  if (kind === 'all-data' && url.searchParams.get('allAreas') === 'yes') {
    const groups = await api.get(
      `${apiPath`/api/indicators/${segment}/areas`}?scope=all-data`,
      areaDisplayGroupListSchema,
    );
    const areaType = areaTypeLookup(groups);
    const codes = [...new Set(groups.flatMap(({ areas }) => areas.map(({ code }) => code)))];
    const firstBatch = codes.slice(0, MAX_AREA_CODES_PER_REQUEST);
    const firstData = firstBatch.length ? await dataFor(firstBatch) : [];
    const encoder = new TextEncoder();
    let offset = firstBatch.length;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(allDataCsv(detail, firstData, areaType)));
      },
      async pull(controller) {
        if (offset >= codes.length) {
          controller.close();
          return;
        }
        const batch = codes.slice(offset, offset + MAX_AREA_CODES_PER_REQUEST);
        offset += batch.length;
        controller.enqueue(
          encoder.encode(allDataCsv(detail, await dataFor(batch), areaType, false)),
        );
      },
    });
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${detail.shortId}-all-data.csv"`,
      },
    });
  }
  let areaData = await dataFor(codesToLoad);
  // With nothing chosen, an indicator with no England value has the page's default level.
  if (kind === 'table' && pickedCodes.length === 0 && !url.searchParams.has('als')) {
    const defaultCodes = await noEnglandAreaCodes(api, segment, areaData);
    if (defaultCodes.length > 0) {
      pickedCodes = defaultCodes;
      areaData = await dataFor([...defaultCodes, ENGLAND_CODE]);
    }
  }

  const { shortId } = detail;

  let csv: string;
  if (kind === 'table') {
    // These validations exactly mirror the controls on the rendered page. A stale or
    // hand-edited URL therefore downloads the table the user can actually see.
    const requestedSex = url.searchParams.get(`sex-${shortId}`) ?? '';
    const sexes = dimensionValues(areaData[0]?.observations ?? [], 'Sex');
    const sex = sexes.includes(requestedSex) ? requestedSex : '';
    const shownObservations = (
      pickedCodes.length > 0
        ? areaData.filter(({ areaCode }) => areaCode !== ENGLAND_CODE)
        : areaData
    ).flatMap(({ observations }) => observations);
    const requestedPeriod = url.searchParams.get(`pt-${shortId}`);
    const periodType: PeriodType = isOneOf(availablePeriodTypes(shownObservations), requestedPeriod)
      ? requestedPeriod
      : 'all';
    const requestedConfidence = url.searchParams.get(`ci-${shortId}`);
    const confidence: ConfidenceLevel = isOneOf(
      availableConfidenceLevels(shownObservations),
      requestedConfidence,
    )
      ? requestedConfidence
      : 'none';
    const hasEngland = englandObservations(areaData).length > 0;
    const benchmarks = selectedBenchmarks(url.searchParams, shortId).filter(
      (choice) => (pickedCodes.length || choice === 'goal') && (choice !== 'england' || hasEngland),
    );
    const columns = selectedTrendColumns(url.searchParams, shortId, [
      ...availableMeasures(shownObservations),
      ...availableConfidenceLevels(shownObservations),
    ]);
    const showRange = benchmarks.some(isRangeBenchmark) && (columns.minMax || columns.percentiles);

    const codeQuery = pickedCodes.map((code) => `areaCode=${encodeURIComponent(code)}`).join('&');
    const includeBenchmarks = benchmarks.some(
      (choice) =>
        choice.startsWith('imd') || choice.startsWith('neighbours:') || choice.startsWith('ca:'),
    );
    const [lookedUp, parents] = await Promise.all([
      pickedCodes.length > 0 &&
      (includeBenchmarks ||
        benchmarks.some((choice) => choice === 'england' || choice === 'region'))
        ? api.get(
            `/api/areas/lookup?${codeQuery}${includeBenchmarks ? '&includeBenchmarks=true' : ''}`,
            areaLookupListSchema,
          )
        : Promise.resolve([]),
      pickedCodes.length > 0 && benchmarks.includes('region')
        ? api.get(
            `/api/areas/parents?${codeQuery}&parentType=${encodeURIComponent('Regions (statistical)')}`,
            areaParentListSchema,
          )
        : Promise.resolve([]),
    ]);
    const geography: BenchmarkGeography = {
      regionByCode: {},
      levelByCode: {},
      ...benchmarkMemberships(lookedUp),
      tierByCode: Object.fromEntries(
        pickedCodes
          .filter((code) => url.searchParams.get(`tier-${code}`) === 'lower')
          .map((code) => [code, 'lower']),
      ),
    };
    for (const { code, areaType, displayGroup } of lookedUp) {
      geography.levelByCode[code] = displayGroup ?? areaType;
    }
    for (const { code, parentCode, parentName } of parents) {
      geography.regionByCode[code] = { code: parentCode, name: parentName };
    }
    const regionCodes = [...new Set(parents.map(({ parentCode }) => parentCode))];
    const regionData = regionCodes.length > 0 ? await dataFor(regionCodes) : [];
    const additional = await loadBenchmarkData(
      api,
      segment,
      benchmarks,
      geography,
      dataFor,
      [...areaData, ...regionData],
      showRange,
    );
    const narrow = (data: IndicatorAreaData) => ({
      ...data,
      observations: filterObservations(data.observations, { sex, periodType }),
    });
    const model = trendTableModel({
      areaData: areaData.map(narrow),
      benchmarks,
      confidence,
      geography,
      ranges: additional.ranges,
      regionData: regionData.map(narrow),
      benchmarkData: additional.benchmarkData.map(narrow),
      goal: detail.goal,
    });
    if (url.searchParams.get('order') === 'desc') model.periods.reverse();
    csv = trendCsv(detail, model, confidence, columns);
  } else {
    const unrecognised = areaData
      .map(({ areaCode }) => areaCode)
      .filter((areaCode) => !areaTypeLabel(areaCode));
    const lookedUpGroups = new Map(
      (unrecognised.length
        ? await api.get(
            `/api/areas/lookup?${unrecognised.map((code) => `areaCode=${encodeURIComponent(code)}`).join('&')}`,
            areaLookupListSchema,
          )
        : []
      ).map(({ code, areaType, displayGroup }) => [code, displayGroup ?? areaType]),
    );
    csv = allDataCsv(detail, areaData, (areaCode) =>
      areaTypeLabel(areaCode, lookedUpGroups.get(areaCode)),
    );
  }

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${shortId}-${kind}.csv"`,
    },
  });
}

/** The areas of the level the page opens on when the indicator has no England value, if any. */
async function noEnglandAreaCodes(
  api: ApiClient,
  segment: string,
  areaData: IndicatorAreaData[],
): Promise<string[]> {
  const england = areaData.find(({ areaCode }) => areaCode === ENGLAND_CODE);
  if (england && england.observations.length > 0) return [];
  const levels = await api.get(
    `${apiPath`/api/indicators/${segment}/areas`}?limit=1`,
    areaDisplayGroupListSchema,
  );
  const level = noEnglandLevel(
    england,
    levels.map(({ displayGroup }) => displayGroup),
  );
  if (!level) return [];
  const groups = await api.get(
    `${apiPath`/api/indicators/${segment}/areas`}?displayGroup=${encodeURIComponent(level)}`,
    areaDisplayGroupListSchema,
  );
  return groups.flatMap(({ areas }) => areas.map(({ code }) => code)).slice(0, MAX_SELECTED_AREAS);
}

function areaTypeLookup(groups: { displayGroup: string; areas: { code: string }[] }[]) {
  const types = new Map<string, string | null>();
  for (const { displayGroup, areas } of groups) {
    for (const { code } of areas) {
      if (!types.has(code)) types.set(code, areaTypeLabel(code, displayGroup));
    }
  }
  return (areaCode: string) => types.get(areaCode) ?? areaTypeLabel(areaCode);
}
