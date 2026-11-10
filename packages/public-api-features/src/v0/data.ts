import { z } from '@fphd/config/zod';
import {
  type DataFilter,
  type DataFilterColumn,
  type DataQuery,
  type DataRowRecord,
  ENGLAND_CODE,
  type Repositories,
} from '@fphd/db';
import { SLUG_PATTERN } from '@fphd/utils/slug';
import { type AgeUnit, durationDays, isoDuration } from '@fphd/utils/standard-dimension';
import type { Request, Response } from 'express';
import { Router } from 'express';

import { areaQuery, startOf, toAreaRef } from './areas.ts';
import {
  csvLines,
  type Format,
  listItems,
  listParam,
  negotiate,
  notModified,
  parseQuery,
  sendInvalid,
} from './http.ts';

/** The CSV columns of `/v0/data`, which are `DataRow`'s properties in the spec, in order. */
export const DATA_COLUMNS = [
  'indicator.shortId',
  'indicator.slug',
  'indicator.name',
  'area.code',
  'area.name',
  'area.type',
  'area.validFrom',
  'area.validTo',
  'fromDate',
  'toDate',
  'sex',
  'age',
  'ageFrom',
  'ageUnder',
  'deprivation',
  'deprivationGroups',
  'deprivationScheme',
  'ethnicity',
  'ethnicityScheme',
  'socioeconomicGroup',
  'socioeconomicGroupScheme',
  'religion',
  'religionScheme',
  'sexuality',
  'sexualityScheme',
  'category1Type',
  'category1',
  'value',
  'lowerCi95',
  'upperCi95',
  'lowerCi998',
  'upperCi998',
  'count',
  'numerator',
  'denominator',
  'note',
  'benchmark.code',
  'comparedToBenchmark',
] as const;

const PARTIAL_DATE = /^\d{4}(-\d{2}(-\d{2})?)?$/;
const DURATION = /^P(\d+)([YMWD])$/;
const DIMENSION_LIST = /^([a-z0-9]+(-[a-z0-9]+)*)?(,([a-z0-9]+(-[a-z0-9]+)*)?)*$/;
const INCLUDES = ['parents', 'siblings', 'statistical-neighbours'] as const;

const UNITS: Record<string, AgeUnit> = { Y: 'year', M: 'month', W: 'week', D: 'day' };

/** The last day of a year, month or day, written as ISO 8601 at any of those precisions. */
export function endOf(partialDate: string): string {
  const [year = '', month, day] = partialDate.split('-');
  if (day !== undefined) return partialDate;
  if (month === undefined) return `${year}-12-31`;
  const last = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  return `${year}-${month}-${String(last).padStart(2, '0')}`;
}

function durationDaysOf(duration: string): number {
  const [, value = '0', designator = 'D'] = DURATION.exec(duration) ?? [];
  return durationDays(Number(value), UNITS[designator] ?? 'day');
}

const dimensionParam = z
  .string()
  .regex(DIMENSION_LIST, 'must be slugs separated by commas')
  .optional();

// The dimension columns `/v0/data` filters on, by their query parameter.
const FILTER_PARAMS: readonly DataFilterColumn[] = [
  'sex',
  'age',
  'deprivation',
  'deprivationScheme',
  'ethnicity',
  'ethnicityScheme',
  'socioeconomicGroup',
  'socioeconomicGroupScheme',
  'religion',
  'religionScheme',
  'sexuality',
  'sexualityScheme',
  'category1Type',
  'category1',
];

export const dataQueryShape = {
  indicator: listParam(/^\d{1,9}$/, 'indicator short ids'),
  ...areaQuery,
  include: listParam(new RegExp(`^(${INCLUDES.join('|')})$`), `one of ${INCLUDES.join(', ')}`),
  from: z.string().regex(PARTIAL_DATE, 'must be a date such as 2020 or 2020-04').optional(),
  to: z.string().regex(PARTIAL_DATE, 'must be a date such as 2022 or 2022-03').optional(),
  latest: z
    .string()
    .regex(/^[1-9]\d{0,5}$/, 'must be a whole number from 1')
    .optional(),
  benchmark: z.string().regex(SLUG_PATTERN, 'must be england or an area type').optional(),
  ...Object.fromEntries(FILTER_PARAMS.map((name) => [name, dimensionParam])),
  deprivationGroups: z.enum(['5', '10']).optional(),
  ageFrom: z.string().regex(DURATION, 'must be a duration such as P50Y').optional(),
  ageUnder: z.string().regex(DURATION, 'must be a duration such as P70Y').optional(),
} as const;

type DataQueryParams = Partial<Record<keyof typeof dataQueryShape | DataFilterColumn, string>>;

function filterOf(value: string): DataFilter {
  const items = value.split(',');
  return { values: items.filter((item) => item !== ''), empty: items.includes('') };
}

/** Whether a row's value is better, worse or similar to its benchmark's, as Fingertips judges. */
export function comparedToBenchmark(row: DataRowRecord): string | null {
  if (row.benchmarkCode === null || row.benchmarkCode === row.areaCode) return null;
  if (row.value === null || row.benchmarkValue === null) return 'not-compared';

  const method = row.comparatorMethod?.toLowerCase() ?? '';
  const byIntervals = method.includes('confidence intervals overlapping');
  // A method naming only 99.8% compares at 99.8%; otherwise 95%.
  const at998 = method.includes('99.8') && !method.includes('95');
  const lower = at998 ? row.lowerCi998 : row.lowerCi95;
  const upper = at998 ? row.upperCi998 : row.upperCi95;
  const benchmark = row.benchmarkValue;

  if (row.polarity === 'higher-is-better' || row.polarity === 'lower-is-better') {
    if (!byIntervals || lower === null || upper === null) return 'not-compared';
    if (lower > benchmark) return row.polarity === 'higher-is-better' ? 'better' : 'worse';
    if (upper < benchmark) return row.polarity === 'lower-is-better' ? 'better' : 'worse';
    return 'similar';
  }
  if (row.polarity !== 'no-polarity') return 'not-compared';
  if (byIntervals) {
    if (lower === null || upper === null) return 'not-compared';
    return lower > benchmark ? 'higher' : upper < benchmark ? 'lower' : 'similar';
  }
  return row.value === benchmark ? 'similar' : row.value < benchmark ? 'lower' : 'higher';
}

function duration(value: number | null, unit: AgeUnit | null): string | null {
  return value === null || unit === null ? null : isoDuration(value, unit);
}

/** A row as the spec's `DataRow` shapes it. */
export function toDataRow(row: DataRowRecord) {
  return {
    indicator: { shortId: row.shortId, slug: row.indicatorSlug, name: row.indicatorName },
    area: toAreaRef({
      code: row.areaCode,
      name: row.areaName,
      level: row.areaLevel,
      validFrom: row.areaValidFrom,
      validTo: row.areaValidTo,
    }),
    fromDate: row.fromDate,
    toDate: row.toDate,
    sex: row.sex,
    age: row.age,
    ageFrom: duration(row.ageFromValue, row.ageFromUnit),
    ageUnder: duration(row.ageUnderValue, row.ageUnderUnit),
    deprivation: row.deprivation,
    deprivationGroups: row.deprivationGroups,
    deprivationScheme: row.deprivationScheme,
    ethnicity: row.ethnicity,
    ethnicityScheme: row.ethnicityScheme,
    socioeconomicGroup: row.socioeconomicGroup,
    socioeconomicGroupScheme: row.socioeconomicGroupScheme,
    religion: row.religion,
    religionScheme: row.religionScheme,
    sexuality: row.sexuality,
    sexualityScheme: row.sexualityScheme,
    category1Type: row.category1Type,
    category1: row.category1,
    value: row.value,
    lowerCi95: row.lowerCi95,
    upperCi95: row.upperCi95,
    lowerCi998: row.lowerCi998,
    upperCi998: row.upperCi998,
    count: row.count,
    numerator: row.numerator,
    denominator: row.denominator,
    note: row.note,
    benchmark: { code: row.benchmarkCode },
    comparedToBenchmark: comparedToBenchmark(row),
  };
}

/** The request's query string, or empty. */
function queryString(request: Request): string {
  const index = request.originalUrl.indexOf('?');
  return index === -1 ? '' : request.originalUrl.slice(index);
}

/** The CSVW document first, then the catalogue, as the spec's `Link` header lists them. */
function describedBy(request: Request, shortIds: string | undefined): string {
  const catalogue =
    shortIds === undefined ? '/v0/indicators' : `/v0/indicators?shortId=${shortIds}`;
  return [
    `</v0/data/metadata${queryString(request)}>; rel="describedby"; type="application/csvm+json"`,
    `<${catalogue}>; rel="describedby"; type="application/json"`,
  ].join(', ');
}

/**
 * The query parsed and checked, or undefined after sending 400. Parameters that can't be used
 * together are refused rather than guessed at.
 */
async function parseDataQuery(
  request: Request,
  response: Response,
  areas: Repositories['areas'],
): Promise<{ params: DataQueryParams; query: DataQuery } | undefined> {
  const params = parseQuery(request, response, dataQueryShape) as DataQueryParams | undefined;
  if (params === undefined) return undefined;

  const invalid: { name: string; reason: string }[] = [];
  if (params.area !== undefined && params.areaType !== undefined) {
    invalid.push({ name: 'areaType', reason: 'cannot be used with area' });
  }
  if (params.latest !== undefined && params.from !== undefined) {
    invalid.push({ name: 'from', reason: 'cannot be used with latest' });
  }
  for (const name of ['parent', 'boundaries'] as const) {
    if (params[name] !== undefined && params.areaType === undefined) {
      invalid.push({ name, reason: 'needs areaType' });
    }
  }
  if (params.include !== undefined && params.area === undefined) {
    invalid.push({ name: 'include', reason: 'needs area' });
  }
  if (listItems(params.include)?.includes('statistical-neighbours')) {
    invalid.push({ name: 'include', reason: 'no statistical neighbour model is loaded yet' });
  }
  const levels = await areas.listLevels();
  const levelSlugs = new Set(levels.map(({ slug }) => slug));
  if (params.areaType !== undefined && !levelSlugs.has(params.areaType)) {
    invalid.push({ name: 'areaType', reason: 'no area type has that slug' });
  }
  const benchmark = params.benchmark ?? 'england';
  if (benchmark !== 'england' && !levelSlugs.has(benchmark)) {
    invalid.push({ name: 'benchmark', reason: 'must be england or an area type' });
  }
  if (invalid.length > 0) {
    sendInvalid(response, invalid);
    return undefined;
  }

  const codes = listItems(params.area);
  const query: DataQuery = {
    areas:
      codes !== undefined
        ? {
            kind: 'codes',
            codes: await withIncluded(areas, codes, listItems(params.include) ?? []),
          }
        : params.areaType !== undefined
          ? {
              kind: 'level',
              level: params.areaType,
              ...(params.parent === undefined ? {} : { parent: params.parent }),
              ...(params.boundaries === undefined
                ? {}
                : { boundaries: startOf(params.boundaries) }),
            }
          : { kind: 'all' },
    benchmark,
    filters: Object.fromEntries(
      FILTER_PARAMS.flatMap((name) => {
        const value = params[name];
        return value === undefined ? [] : [[name, filterOf(value)]];
      }),
    ),
  };
  const shortIds = listItems(params.indicator);
  if (shortIds !== undefined) query.shortIds = shortIds.map(Number);
  if (params.from !== undefined) query.from = startOf(params.from);
  if (params.to !== undefined) query.to = endOf(params.to);
  if (params.latest !== undefined) query.latest = Number(params.latest);
  if (params.deprivationGroups !== undefined)
    query.deprivationGroups = Number(params.deprivationGroups);
  if (params.ageFrom !== undefined || params.ageUnder !== undefined) {
    query.ageRange = {
      ...(params.ageFrom === undefined ? {} : { from: durationDaysOf(params.ageFrom) }),
      ...(params.ageUnder === undefined ? {} : { under: durationDaysOf(params.ageUnder) }),
    };
  }
  return { params, query };
}

/** The codes asked for, with the parents or siblings `include` adds. */
async function withIncluded(
  areas: Repositories['areas'],
  codes: readonly string[],
  include: readonly string[],
): Promise<string[]> {
  const all = new Set(codes);
  if (include.length === 0) return [...all];

  const levels = await areas.listLevels();
  for (const area of await areas.find({ codes })) {
    const parentLevels = levels.find(({ slug }) => slug === area.level)?.parentLevels ?? [];
    const ancestors = await areas.listAncestors(area.code);
    const parents = ancestors.filter(({ level }) => parentLevels.includes(level));
    if (include.includes('parents')) {
      for (const parent of parents) all.add(parent.code);
      if (parentLevels.includes('england')) all.add(ENGLAND_CODE);
    }
    const defaultParent = parents.find(({ level }) => level === parentLevels[0]);
    if (include.includes('siblings') && defaultParent !== undefined) {
      const siblings = await areas.find({
        level: area.level,
        parent: defaultParent.code,
        on: new Date().toISOString().slice(0, 10),
      });
      for (const sibling of siblings) all.add(sibling.code);
    }
  }
  return [...all];
}

async function streamRows(
  response: Response,
  format: Format,
  batches: AsyncIterable<DataRowRecord[]>,
): Promise<void> {
  let first = true;
  try {
    if (format === 'csv') {
      response.type('text/csv; charset=utf-8');
      response.write(csvLines(DATA_COLUMNS, [], true));
      for await (const batch of batches) {
        response.write(csvLines(DATA_COLUMNS, batch.map(toDataRow), false));
      }
    } else {
      response.type('application/json');
      response.write('{"data":[');
      for await (const batch of batches) {
        for (const row of batch) {
          response.write(`${first ? '' : ','}${JSON.stringify(toDataRow(row))}`);
          first = false;
        }
      }
      response.write(']}');
    }
    response.end();
  } catch (error) {
    // The status line is already sent, so the only way to say the response is incomplete is
    // to cut it off. The error still reaches the request's log line.
    (response as Response & { err?: Error }).err =
      error instanceof Error ? error : new Error(String(error));
    response.destroy(error instanceof Error ? error : undefined);
  }
}

export function dataRouter(repositories: Repositories): Router {
  const router = Router();

  router.get('/v0/data', async (request, response) => {
    const parsed = await parseDataQuery(request, response, repositories.areas);
    if (parsed === undefined) return;
    const format = negotiate(request, response, ['csv', 'json']);
    if (format === undefined) return;
    if (notModified(request, response, await repositories.reference.dataVersion(), format)) return;

    response.set('Link', describedBy(request, parsed.params.indicator));
    await streamRows(response, format, repositories.data.stream(parsed.query));
  });

  router.get('/v0/data/metadata', async (request, response) => {
    const parsed = await parseDataQuery(request, response, repositories.areas);
    if (parsed === undefined) return;
    if (notModified(request, response, await repositories.reference.dataVersion(), 'json')) return;

    const shortIds = parsed.params.indicator;
    response.type('application/csvm+json').json({
      '@context': 'http://www.w3.org/ns/csvw',
      url: `/v0/data${queryString(request)}`,
      'dc:title': 'Find Public Health Data',
      'dc:license': 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
      'rdfs:seeAlso':
        shortIds === undefined ? '/v0/indicators' : `/v0/indicators?shortId=${shortIds}`,
      tableSchema: {
        columns: DATA_COLUMNS.map((name) => ({ name, titles: name, datatype: datatypeOf(name) })),
      },
    });
  });

  return router;
}

const NUMBER_COLUMNS = new Set([
  'indicator.shortId',
  'deprivation',
  'deprivationGroups',
  'value',
  'lowerCi95',
  'upperCi95',
  'lowerCi998',
  'upperCi998',
  'count',
  'numerator',
  'denominator',
]);
const DATE_COLUMNS = new Set(['area.validFrom', 'area.validTo', 'fromDate', 'toDate']);

function datatypeOf(column: string): string {
  if (NUMBER_COLUMNS.has(column)) return 'number';
  if (DATE_COLUMNS.has(column)) return 'date';
  if (column === 'ageFrom' || column === 'ageUnder') return 'duration';
  return 'string';
}
