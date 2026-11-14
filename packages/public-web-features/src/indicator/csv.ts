import {
  areaDisplayGroupListSchema,
  areaLookupListSchema,
  areaParentListSchema,
  indicatorAreaDataListSchema,
  indicatorAreaDataSchema,
  indicatorDetailSchema,
  indicatorRangeSchema,
  MAX_AREA_CODES_PER_REQUEST,
  pickAreaCodes,
} from '@fphd/public-api-features/contract';
import { isOneOf } from '@fphd/utils/is-one-of';
import { apiPath } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import { pageSearch } from '@fphd/web-server/page-url';
import { type LoaderFunctionArgs, redirect } from 'react-router';
import { areaTypeLabel } from '../geography/groups.ts';
import { MAX_SELECTED_AREAS } from '../selection-limits.ts';
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
import { indicatorCsvPath, isIndicatorSegment, redirectStatus } from './paths.ts';
import { selectedTrendColumns, trendTableModel } from './trend.ts';
import { loadIndicatorViewCsv } from './view-csv.ts';

const ENGLAND = 'E92000001';

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
  const pickedCodes = pickAreaCodes(url.searchParams.getAll('as'), Number.POSITIVE_INFINITY)
    .filter((code) => code !== ENGLAND)
    .slice(0, MAX_SELECTED_AREAS);
  const codesToLoad = [...pickedCodes, ENGLAND];
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
  const detail = await api.get(apiPath`/api/indicators/${segment}`, indicatorDetailSchema);
  if (detail.slug !== segment) {
    throw redirect(
      `${indicatorCsvPath(detail.slug, kind)}${pageSearch(url)}`,
      redirectStatus(segment, detail.slug),
    );
  }
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
  const areaData = await dataFor(codesToLoad);

  const { shortId } = detail;

  let csv: string;
  if (kind === 'table') {
    // These validations exactly mirror the controls on the rendered page. A stale or
    // hand-edited URL therefore downloads the table the user can actually see.
    const requestedSex = url.searchParams.get(`sex-${shortId}`) ?? '';
    const sexes = dimensionValues(areaData[0]?.observations ?? [], 'Sex');
    const sex = sexes.includes(requestedSex) ? requestedSex : '';
    const shownObservations = (
      pickedCodes.length > 0 ? areaData.filter(({ areaCode }) => areaCode !== ENGLAND) : areaData
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
    const requestedBenchmark = url.searchParams.get(`cmp-${shortId}`);
    const benchmark =
      pickedCodes.length > 0 &&
      (requestedBenchmark === 'england' || requestedBenchmark === 'region')
        ? requestedBenchmark
        : 'none';
    const showRange = benchmark !== 'none' && url.searchParams.get(`cr-${shortId}`) === 'yes';

    const codeQuery = pickedCodes.map((code) => `areaCode=${encodeURIComponent(code)}`).join('&');
    const [lookedUp, parents] = await Promise.all([
      benchmark === 'england' && showRange
        ? api.get(`/api/areas/lookup?${codeQuery}`, areaLookupListSchema)
        : Promise.resolve([]),
      benchmark === 'region'
        ? api.get(
            `/api/areas/parents?${codeQuery}&parentType=${encodeURIComponent('Regions (statistical)')}`,
            areaParentListSchema,
          )
        : Promise.resolve([]),
    ]);
    const geography: BenchmarkGeography = { regionByCode: {}, levelByCode: {} };
    for (const { code, areaType, displayGroup } of lookedUp) {
      geography.levelByCode[code] = displayGroup ?? areaType;
    }
    for (const { code, parentCode, parentName } of parents) {
      geography.regionByCode[code] = { code: parentCode, name: parentName };
    }
    const regionCodes = [...new Set(parents.map(({ parentCode }) => parentCode))];
    const rangeLevels =
      benchmark === 'england'
        ? [...new Set(Object.values(geography.levelByCode))]
        : benchmark === 'region'
          ? ['Statistical regions']
          : [];
    const [regionData, rangeEntries] = await Promise.all([
      regionCodes.length > 0 ? dataFor(regionCodes) : Promise.resolve([] as IndicatorAreaData[]),
      showRange
        ? Promise.all(
            rangeLevels.map(async (level) => {
              const range = await api.get(
                `${apiPath`/api/indicators/${segment}/range`}?displayGroup=${encodeURIComponent(level)}`,
                indicatorRangeSchema,
              );
              return [level, range.periods] as const;
            }),
          )
        : Promise.resolve([]),
    ]);
    const narrow = (data: IndicatorAreaData) => ({
      ...data,
      observations: filterObservations(data.observations, { sex, periodType }),
    });
    const model = trendTableModel({
      areaData: areaData.map(narrow),
      benchmark,
      confidence,
      geography,
      ranges: Object.fromEntries(rangeEntries),
      regionData: regionData.map(narrow),
    });
    if (url.searchParams.get('order') === 'desc') model.periods.reverse();
    csv = trendCsv(
      detail,
      model,
      confidence,
      showRange,
      url.searchParams.has(`columns-${shortId}`)
        ? selectedTrendColumns(url.searchParams, shortId, [
            ...availableMeasures(shownObservations),
            ...availableConfidenceLevels(shownObservations),
          ])
        : undefined,
    );
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

function areaTypeLookup(groups: { displayGroup: string; areas: { code: string }[] }[]) {
  const types = new Map<string, string | null>();
  for (const { displayGroup, areas } of groups) {
    for (const { code } of areas) {
      if (!types.has(code)) types.set(code, areaTypeLabel(code, displayGroup));
    }
  }
  return (areaCode: string) => types.get(areaCode) ?? areaTypeLabel(areaCode);
}
