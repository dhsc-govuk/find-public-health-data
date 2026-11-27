import { Readable } from 'node:stream';

import { type Database, schema } from '@fphd/db';
import { apiLogin, auditEntriesFor, createTestDb } from '@fphd/db/testing';
import { request } from '@fphd/express/testing';
import { and, asc, eq } from 'drizzle-orm';
import { v7 as randomUuidV7 } from 'uuid';
import { afterAll, describe, expect, it } from 'vitest';

import { dataTableCheckRouter } from './data-table-check.ts';
import type { DataTableRow } from './data-table-check-contract.ts';
import { confirmDataTable } from './data-table-check-repository.ts';
import type { DataTableFilter } from './data-table-filter-contract.ts';
import { processDataUpload } from './data-upload-load-repository.ts';
import { updateIndicatorDraft } from './indicator-draft-repository.ts';
import { createDraftFromPublished } from './indicator-publish-repository.ts';
import { ACTOR, AS_ACTOR, lockWaited, newDraft } from './indicator-repository.testing.ts';
import { createInternalRepositories } from './repositories.ts';
import {
  createRouterTestApp,
  TEST_TEAM_ID,
  TEST_USER_ID,
  testSessionCookie,
  testSessionVerifier,
} from './testing.ts';

const { currentPublishedVersion, indicatorVersion } = schema;

const testDb = await createTestDb({ template: 'seeded' });
// The routes run as internal_api, so its grants are tested too; the setup writes as the owner.
const internalDb = testDb.connectDb({ login: apiLogin('internal_api') });
const ownerDb = testDb.db;

const app = createRouterTestApp(
  dataTableCheckRouter(
    createInternalRepositories(internalDb).dataUploads,
    createInternalRepositories(internalDb).indicators,
    testSessionVerifier,
  ),
);

afterAll(async () => {
  await testDb.drop();
});

const CSV = [
  ' Area_Code ,period_start,period_end,value,lower_ci_95,sex,age,category_type,category,value_note',
  'E92000001,2019-04-01,2020-03-31,83.8,83.7,Female,<75 yrs,,,',
  'E92000001,2019-04-01,2020-03-31,83.1,83.0,Persons,All ages,,,',
  'E08000035,2019-04-01,2020-03-31,,,,,Ethnic groups [4],White,Aggregated from values for merged CCGs',
  'E92000001,2020-04-01,2021-03-31,1.5e3,,Male,,,,',
].join('\n');

/** Loads a file into the draft as an upload does, without storage: the file is read in place. */
async function load(indicatorId: string, content = CSV): Promise<string> {
  const batchId = randomUuidV7();
  const result = await processDataUpload(
    internalDb,
    {
      batchId,
      indicatorId,
      blobName: `${indicatorId}/${batchId}.csv`,
      originalFilename: 'data.csv',
      byteSize: Buffer.byteLength(content),
      sha256: '0'.repeat(64),
      actor: AS_ACTOR,
    },
    async () => Readable.from([content]),
    new AbortController().signal,
  );
  if (!result.ok) throw new Error(`the upload was refused: ${JSON.stringify(result)}`);
  return batchId;
}

async function draftOf(db: Database, indicatorId: string) {
  const [draft] = await db
    .select()
    .from(indicatorVersion)
    .where(
      and(eq(indicatorVersion.indicatorId, indicatorId), eq(indicatorVersion.status, 'draft')),
    );
  if (draft === undefined) throw new Error(`indicator ${indicatorId} has no draft`);
  return draft;
}

/**
 * The nth seeded published indicator by id, so each test that opens a draft takes its own, moved
 * from Fingertips into the test session's team so its publisher may edit it.
 */
async function seededPublished(nth: number) {
  const [published] = await ownerDb
    .select({ indicatorId: currentPublishedVersion.indicatorId, id: currentPublishedVersion.id })
    .from(currentPublishedVersion)
    .orderBy(asc(currentPublishedVersion.indicatorId))
    .offset(nth)
    .limit(1);
  if (published === undefined) throw new Error(`the seed has no published indicator ${nth}`);
  await ownerDb
    .update(schema.indicator)
    .set({ teamId: TEST_TEAM_ID })
    .where(eq(schema.indicator.id, published.indicatorId));
  return published;
}

async function check(indicatorId: string, query = '') {
  return request(app)
    .get(`/api/internal/indicators/${indicatorId}/data-table${query}`)
    .set('Cookie', await testSessionCookie(['publisher']));
}

async function values(indicatorId: string, query: string) {
  return request(app)
    .get(`/api/internal/indicators/${indicatorId}/data-table/values${query}`)
    .set('Cookie', await testSessionCookie(['publisher']));
}

/** The labels of the values listed, by column. */
async function labels(indicatorId: string, query: string): Promise<Record<string, string[]>> {
  const { body } = await values(indicatorId, query);
  return Object.fromEntries(
    body.columns.map(({ column, values }: { column: string; values: { label: string }[] }) => [
      column,
      values.map(({ label }) => label),
    ]),
  );
}

/** The id of the one value of a column with a label, as the values route lists it. */
async function filterId(indicatorId: string, column: string, label: string): Promise<string> {
  const { body } = await values(indicatorId, `?column=${column}`);
  const found = body.columns[0].values.filter((value: { label: string }) => value.label === label);
  expect(found).toHaveLength(1);
  return found[0].id;
}

/** The query string that filters by each `[column, label]`. */
async function filterQuery(indicatorId: string, ...filters: [string, string][]): Promise<string> {
  const ids = await Promise.all(
    filters.map(([column, label]) => filterId(indicatorId, column, label)),
  );
  return `?${ids.map((id) => `f=${id}`).join('&')}`;
}

async function confirm(indicatorId: string, batchId: string) {
  return request(app)
    .put(`/api/internal/indicators/${indicatorId}/data-table/confirmation`)
    .set('Cookie', await testSessionCookie(['publisher']))
    .send({ batchId });
}

describe('GET /api/internal/indicators/:id/data-table', () => {
  it("answers a page of the draft's batch with its references named", async () => {
    const { indicatorId } = await newDraft(internalDb, 'Check reads rows');
    const batchId = await load(indicatorId);

    const response = await check(indicatorId);

    expect(response.status).toBe(200);
    expect(response.body.dataTable).toMatchObject({
      batchId,
      rowCount: 4,
      columns: [
        'area_code',
        'period_start',
        'period_end',
        'value',
        'lower_ci_95',
        'sex',
        'age',
        'category_type',
        'category',
        'value_note',
      ],
      yearType: null,
      replacesPublished: false,
      page: 1,
      rowsPerPage: 10,
    });
    expect(response.body.dataTable.rows).toHaveLength(4);
    expect(response.body.dataTable.rows).toEqual(
      expect.arrayContaining([
        {
          areaCode: 'E92000001',
          fromDate: '2019-04-01',
          toDate: '2020-03-31',
          dimensionKey: expect.any(String),
          value: 83.8,
          count: null,
          numerator: null,
          denominator: null,
          lowerCi95: 83.7,
          upperCi95: null,
          lowerCi998: null,
          upperCi998: null,
          sex: 'Female',
          age: '<75 yrs',
          categoryType: null,
          category: null,
          valueNotes: [],
        },
        expect.objectContaining({ areaCode: 'E92000001', value: 83.1, sex: null, age: null }),
        expect.objectContaining({
          areaCode: 'E08000035',
          value: null,
          categoryType: 'Ethnic groups [4]',
          category: 'White',
          valueNotes: ['Aggregated from values for merged CCGs'],
        }),
        expect.objectContaining({ fromDate: '2020-04-01', value: 1500, sex: 'Male' }),
      ]),
    );
  });

  it('pages through the rows in a stable order, each row once', async () => {
    const { indicatorId } = await newDraft(internalDb, 'Check pages rows');
    await load(indicatorId);

    const first = await check(indicatorId, '?rowsPerPage=10');
    const pages = await Promise.all(
      [1, 2, 3].map((page) => check(indicatorId, `?page=${page}&rowsPerPage=25`)),
    );

    expect(pages[0]?.body.dataTable.rows).toEqual(first.body.dataTable.rows);
    expect(pages[1]?.body.dataTable.rows).toEqual([]);
    expect(pages[2]?.body.dataTable).toMatchObject({ page: 3, rowsPerPage: 25, rows: [] });
  });

  it('splits the rows across pages, read from either end, without repeating or losing one', async () => {
    const { indicatorId } = await newDraft(internalDb, 'Check splits pages');
    const rows = Array.from(
      { length: 41 },
      (_, index) => `E92000001,${1950 + index}-01-01,${1950 + index}-12-31,${index}`,
    );
    await load(indicatorId, ['area_code,period_start,period_end,value', ...rows].join('\n'));

    const pages = await Promise.all(
      [1, 2, 3, 4, 5].map((page) => check(indicatorId, `?page=${page}&rowsPerPage=10`)),
    );
    const values = pages.flatMap((page) =>
      page.body.dataTable.rows.map((row: { value: number }) => row.value),
    );

    expect(pages.map((page) => page.body.dataTable.rows.length)).toEqual([10, 10, 10, 10, 1]);
    expect(values).toEqual(Array.from({ length: 41 }, (_, index) => index));
  });

  it("answers the draft's year type for labelling its periods", async () => {
    const { indicatorId } = await newDraft(internalDb, 'Check year type');
    await load(indicatorId);
    await updateIndicatorDraft(
      internalDb,
      indicatorId,
      'period-type',
      { periodType: 'years', yearType: 'specified-end-date', yearEndDay: 31, yearEndMonth: 7 },
      {},
      AS_ACTOR,
    );

    const response = await check(indicatorId);

    expect(response.body.dataTable.yearType).toEqual({
      value: 'specified-end-date',
      label: 'August to July',
    });
  });

  it('answers no data table before a file has loaded', async () => {
    const { indicatorId } = await newDraft(internalDb, 'Check nothing loaded');

    const response = await check(indicatorId);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ dataTable: null });
  });

  it("says an update's data table replaces the live one only once the draft has its own", async () => {
    const published = await seededPublished(2);
    await createDraftFromPublished(internalDb, published.indicatorId, AS_ACTOR);

    const inherited = await check(published.indicatorId);
    const batchId = await load(published.indicatorId);
    const replaced = await check(published.indicatorId);

    expect(inherited.body.dataTable).toMatchObject({ replacesPublished: false });
    expect(replaced.body.dataTable).toMatchObject({
      batchId,
      rowCount: 4,
      replacesPublished: true,
    });
  });

  it('answers 404 for an indicator with no draft', async () => {
    const { indicatorId } = await seededPublished(0);

    const response = await check(indicatorId);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'no_draft' });
  });
});

// Two sexes, two ages, two categories with a name in common and one note, with empty cells in
// every optional column and in the value.
const FILTER_CSV = [
  'area_code,period_start,period_end,value,count,sex,age,category_type,category,value_note',
  'E92000001,2019-04-01,2020-03-31,9.5,-3,Female,<75 yrs,,,',
  'E92000001,2020-04-01,2021-03-31,10,,Female,18+ yrs,,,',
  'E08000035,2019-04-01,2020-03-31,,12,Male,<75 yrs,,,Aggregated from values for merged CCGs',
  'E08000035,2020-04-01,2021-03-31,100.25,12,,18+ yrs,,,',
  'E06000047,2020-04-01,2021-03-31,9.5,,,,Ethnic groups [4],White,',
  'E06000047,2021-04-01,2022-03-31,9.5,,,,Ethnic groups [17],White,',
].join('\n');

async function filterable(name: string, content = FILTER_CSV): Promise<string> {
  const { indicatorId } = await newDraft(internalDb, name);
  await load(indicatorId, content);
  return indicatorId;
}

describe('GET /api/internal/indicators/:id/data-table/values', () => {
  it.each([
    ['value', ['Blank', '100.25', '10', '9.5']],
    ['count', ['Blank', '12', '-3']],
    ['period', ['2021/22', '2020/21', '2019/20']],
    ['areaCode', ['E06000047', 'E08000035', 'E92000001']],
    ['sex', ['Persons', 'Female', 'Male']],
    ['age', ['All ages', '<75 yrs', '18+ yrs']],
    ['categoryType', ['Blank', 'Ethnic groups [4]', 'Ethnic groups [17]']],
    ['category', ['Blank', 'White']],
    ['valueNote', ['Blank', 'Aggregated from values for merged CCGs']],
  ])('lists each value of %s once, in order', async (column, expected) => {
    const indicatorId = await filterable(`Values of ${column}`);

    const listed = await labels(indicatorId, `?column=${column}`);

    expect(listed).toEqual({ [column]: expected });
  });

  it('lists a total of sex or age by its name, with the id of any other empty cell', async () => {
    const indicatorId = await filterable('Values of totals');
    const hash = async (column: string, label: string) =>
      (await filterId(indicatorId, column, label)).split('.')[1];

    const blank = await hash('value', 'Blank');

    expect(await hash('sex', 'Persons')).toBe(blank);
    expect(await hash('age', 'All ages')).toBe(blank);
  });

  it('lists no values for a column the file did not have', async () => {
    const indicatorId = await filterable('Values without a column');

    expect((await values(indicatorId, '?column=denominator')).body).toEqual({ columns: [] });
  });

  it('finds the values that contain a search in every column, whatever its case', async () => {
    const indicatorId = await filterable('Values search');

    expect(await labels(indicatorId, '?search=9')).toEqual({
      value: ['9.5'],
      period: ['2019/20'],
      areaCode: ['E92000001'],
    });
    expect(await labels(indicatorId, '?search=MALE')).toEqual({ sex: ['Female', 'Male'] });
    expect(await labels(indicatorId, '?search=%3C')).toEqual({ age: ['<75 yrs'] });
    expect(await labels(indicatorId, '?search=e0&column=areaCode')).toEqual({
      areaCode: ['E06000047', 'E08000035'],
    });
    expect(await labels(indicatorId, '?search=%25')).toEqual({});
    expect(await labels(indicatorId, '?search=blank')).toEqual({
      value: ['Blank'],
      count: ['Blank'],
      categoryType: ['Blank'],
      category: ['Blank'],
      valueNote: ['Blank'],
    });
    expect(await labels(indicatorId, '?search=PERSON')).toEqual({ sex: ['Persons'] });
    expect(await labels(indicatorId, '?search=all%20ages')).toEqual({ age: ['All ages'] });
  });

  it.each([
    ['0.00005', '0.00005'],
    ['0.000012', '0.000012'],
    ['-0.00005', '-0.00005'],
    ['1e-7', '1e-7'],
    ['1.5e-10', '1.5e-10'],
    ['1e15', '1000000000000000'],
    ['123456789012345680000', '123456789012345680000'],
    ['1.5e21', '1.5e+21'],
    ['0.30000000000000004', '0.30000000000000004'],
  ])('finds %s by what the table shows for it, %s', async (stored, shown) => {
    expect(String(Number(stored))).toBe(shown);
    const indicatorId = await filterable(
      `Values shown as ${shown.replace('-', 'minus ').replace('+', ' plus ')}`,
      [
        'area_code,period_start,period_end,value',
        `E92000001,2019-04-01,2020-03-31,${stored}`,
        'E92000001,2020-04-01,2021-03-31,7',
      ].join('\n'),
    );

    expect(await labels(indicatorId, `?column=value&search=${encodeURIComponent(shown)}`)).toEqual({
      value: [shown],
    });
  });

  it('lists a blank only in a column with an empty cell', async () => {
    const indicatorId = await filterable(
      'Values without blanks',
      [
        'area_code,period_start,period_end,value,sex,age',
        'E92000001,2019-04-01,2020-03-31,9.5,Female,',
        'E92000001,2020-04-01,2021-03-31,10,Male,',
      ].join('\n'),
    );

    expect(await labels(indicatorId, '?column=value')).toEqual({ value: ['10', '9.5'] });
    expect(await labels(indicatorId, '?column=sex')).toEqual({ sex: ['Female', 'Male'] });
    expect(await labels(indicatorId, '?column=age')).toEqual({ age: ['All ages'] });
  });

  it('lists no more than 100 values of a column, and says when there are others', async () => {
    const rows = (count: number) =>
      [
        'area_code,period_start,period_end,value',
        ...Array.from(
          { length: count },
          (_, index) => `E92000001,${1900 + index}-01-01,${1900 + index}-12-31,${index}`,
        ),
      ].join('\n');
    const hundred = await filterable('Values to the limit', rows(100));
    const others = await filterable('Values past the limit', rows(101));

    for (const column of ['value', 'period']) {
      const [all] = (await values(hundred, `?column=${column}`)).body.columns;
      const [first] = (await values(others, `?column=${column}`)).body.columns;
      expect(all).toMatchObject({ more: false });
      expect(all.values).toHaveLength(100);
      expect(first).toMatchObject({ more: true });
      expect(first.values).toHaveLength(100);
    }
    expect(await labels(others, '?column=value&search=100')).toEqual({ value: ['100'] });
  });

  it('answers 404 for an indicator with no draft', async () => {
    const { indicatorId } = await seededPublished(3);

    expect((await values(indicatorId, '?column=value')).status).toBe(404);
  });
});

describe('GET /api/internal/indicators/:id/data-table, filtered', () => {
  async function matching(indicatorId: string, ...filters: [string, string][]) {
    const response = await check(indicatorId, await filterQuery(indicatorId, ...filters));
    expect(response.status).toBe(200);
    const { dataTable } = response.body;
    expect(dataTable.rowCount).toBe(6);
    expect(dataTable.rows).toHaveLength(dataTable.matchingRowCount);
    expect(dataTable.filters.map(({ column, label }: DataTableFilter) => [column, label])).toEqual(
      filters,
    );
    return dataTable.rows.map(
      ({ areaCode, fromDate }: DataTableRow) => `${areaCode} ${fromDate.slice(0, 4)}`,
    );
  }

  it.each<[column: string, label: string, rows: string[]]>([
    ['value', '9.5', ['E92000001 2019', 'E06000047 2020', 'E06000047 2021']],
    ['count', '-3', ['E92000001 2019']],
    ['period', '2019/20', ['E92000001 2019', 'E08000035 2019']],
    ['areaCode', 'E08000035', ['E08000035 2019', 'E08000035 2020']],
    ['sex', 'Female', ['E92000001 2019', 'E92000001 2020']],
    ['age', '<75 yrs', ['E92000001 2019', 'E08000035 2019']],
    ['categoryType', 'Ethnic groups [4]', ['E06000047 2020']],
    ['category', 'White', ['E06000047 2020', 'E06000047 2021']],
    ['valueNote', 'Aggregated from values for merged CCGs', ['E08000035 2019']],
    ['value', 'Blank', ['E08000035 2019']],
    ['count', 'Blank', ['E92000001 2020', 'E06000047 2020', 'E06000047 2021']],
    ['sex', 'Persons', ['E08000035 2020', 'E06000047 2020', 'E06000047 2021']],
    ['age', 'All ages', ['E06000047 2020', 'E06000047 2021']],
    [
      'categoryType',
      'Blank',
      ['E92000001 2019', 'E92000001 2020', 'E08000035 2019', 'E08000035 2020'],
    ],
    ['category', 'Blank', ['E92000001 2019', 'E92000001 2020', 'E08000035 2019', 'E08000035 2020']],
    [
      'valueNote',
      'Blank',
      ['E92000001 2019', 'E92000001 2020', 'E08000035 2020', 'E06000047 2020', 'E06000047 2021'],
    ],
  ])('shows the rows with a %s of %s', async (column, label, rows) => {
    const indicatorId = await filterable(`Filter by ${column} ${label}`);

    expect((await matching(indicatorId, [column, label])).sort()).toEqual(rows.toSorted());
  });

  it("shows the rows with any of a column's values that match every column", async () => {
    const indicatorId = await filterable('Filter by several');

    expect(
      (await matching(indicatorId, ['period', '2020/21'], ['period', '2019/20'])).sort(),
    ).toEqual([
      'E06000047 2020',
      'E08000035 2019',
      'E08000035 2020',
      'E92000001 2019',
      'E92000001 2020',
    ]);
    expect(
      (
        await matching(
          indicatorId,
          ['sex', 'Male'],
          ['sex', 'Female'],
          ['age', '<75 yrs'],
          ['period', '2019/20'],
        )
      ).sort(),
    ).toEqual(['E08000035 2019', 'E92000001 2019']);
    expect(await matching(indicatorId, ['sex', 'Female'], ['areaCode', 'E08000035'])).toEqual([]);
    expect(
      (await matching(indicatorId, ['sex', 'Persons'], ['sex', 'Male'], ['age', '18+ yrs'])).sort(),
    ).toEqual(['E08000035 2020']);
    expect((await matching(indicatorId, ['value', 'Blank'], ['value', '10'])).sort()).toEqual([
      'E08000035 2019',
      'E92000001 2020',
    ]);
  });

  it('splits the matching rows across pages, read from either end', async () => {
    const rows = Array.from(
      { length: 82 },
      (_, index) =>
        `E92000001,${1920 + index}-01-01,${1920 + index}-12-31,${index},${index % 2 ? 'Male' : 'Female'}`,
    );
    const indicatorId = await filterable(
      'Filter pages',
      ['area_code,period_start,period_end,value,sex', ...rows].join('\n'),
    );
    const query = await filterQuery(indicatorId, ['sex', 'Female']);

    const pages = await Promise.all(
      [1, 2, 3, 4, 5, 6].map((page) => check(indicatorId, `${query}&page=${page}`)),
    );

    expect(pages.map(({ body }) => body.dataTable.matchingRowCount)).toEqual(Array(6).fill(41));
    expect(pages.map(({ body }) => body.dataTable.rows.length)).toEqual([10, 10, 10, 10, 1, 0]);
    expect(
      pages.flatMap(({ body }) => body.dataTable.rows.map(({ value }: DataTableRow) => value)),
    ).toEqual(Array.from({ length: 41 }, (_, index) => index * 2));
  });

  it('keeps a filter on its value when another upload replaces the table', async () => {
    const indicatorId = await filterable('Filter across uploads');
    const query = await filterQuery(
      indicatorId,
      ['value', '10'],
      ['sex', 'Male'],
      ['age', '18+ yrs'],
    );
    await load(
      indicatorId,
      [
        'area_code,period_start,period_end,value,sex',
        'E92000001,2001-01-01,2001-12-31,7,Female',
        'E92000001,2002-01-01,2002-12-31,10,Male',
        'E92000001,2003-01-01,2003-12-31,8,Male',
      ].join('\n'),
    );

    const { dataTable } = (await check(indicatorId, query)).body;

    expect(dataTable.filters.map(({ label }: DataTableFilter) => label)).toEqual(['10', 'Male']);
    expect(dataTable.rows.map(({ value }: DataTableRow) => value)).toEqual([10]);
  });

  it('leaves out a blank when another upload fills every cell of its column', async () => {
    const indicatorId = await filterable('Filter by blanks across uploads');
    const query = await filterQuery(indicatorId, ['value', 'Blank']);
    await load(
      indicatorId,
      [
        'area_code,period_start,period_end,value',
        'E92000001,2001-01-01,2001-12-31,7',
        'E92000001,2002-01-01,2002-12-31,10',
      ].join('\n'),
    );

    expect((await check(indicatorId, query)).body.dataTable).toMatchObject({
      filters: [],
      matchingRowCount: 2,
    });
  });

  it('leaves out filters whose values are not in the table, showing every row for none', async () => {
    const indicatorId = await filterable('Filter by nothing found');

    const { dataTable } = (
      await check(indicatorId, '?f=sex.0000000000&f=value.0000000000&f=period.0000000000')
    ).body;

    expect(dataTable).toMatchObject({ filters: [], rowCount: 6, matchingRowCount: 6 });
    expect(dataTable.rows).toHaveLength(6);
  });

  it("labels the periods it filters by as the draft's year type does", async () => {
    const indicatorId = await filterable('Filter by rolling years');
    await updateIndicatorDraft(
      internalDb,
      indicatorId,
      'period-type',
      { periodType: 'years', yearType: 'rolling' },
      {},
      AS_ACTOR,
    );

    expect(await matching(indicatorId, ['period', 'April 2021 to March 2022'])).toEqual([
      'E06000047 2021',
    ]);
  });

  it('answers 400 for a filter that is not an id', async () => {
    const indicatorId = await filterable('Filter by a bad id');

    expect((await check(indicatorId, '?f=sex.Female')).status).toBe(400);
  });
});

describe('PUT /api/internal/indicators/:id/data-table/confirmation', () => {
  it('confirms the batch the draft points at', async () => {
    const { indicatorId } = await newDraft(internalDb, 'Confirm the batch');
    const batchId = await load(indicatorId);

    const response = await confirm(indicatorId, batchId);

    expect(response.status).toBe(200);
    const draft = await draftOf(ownerDb, indicatorId);
    expect(draft.dataTableConfirmedAt?.toISOString()).toBe(response.body.confirmedAt);
    expect(draft.updatedBy).toBe(TEST_USER_ID);
  });

  it('records the confirmation under the request that made it', async () => {
    const { indicatorId } = await newDraft(internalDb, 'Confirm on the record');
    const batchId = await load(indicatorId);

    const response = await confirm(indicatorId, batchId);

    expect((await auditEntriesFor(ownerDb, indicatorId)).at(-1)).toEqual({
      actorId: TEST_USER_ID,
      action: 'indicator.data_table_confirmed',
      entityType: 'indicator',
      requestId: response.headers['x-fphd-request-id'],
      changes: { dataTableConfirmedAt: { before: null, after: response.body.confirmedAt } },
    });
  });

  it('refuses a batch another upload has replaced, confirming neither', async () => {
    const { indicatorId } = await newDraft(internalDb, 'Confirm a replaced batch');
    const shown = await load(indicatorId);
    const replacement = await load(indicatorId);

    const response = await confirm(indicatorId, shown);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'data_table_changed' });
    const draft = await draftOf(ownerDb, indicatorId);
    expect(draft).toMatchObject({ uploadBatchId: replacement, dataTableConfirmedAt: null });
    expect((await auditEntriesFor(ownerDb, indicatorId)).map(({ action }) => action)).not.toContain(
      'indicator.data_table_confirmed',
    );
  });

  it('refuses once the draft is published', async () => {
    const { indicatorId, versionId } = await newDraft(internalDb, 'Confirm after publication');
    const batchId = await load(indicatorId);
    await ownerDb
      .update(indicatorVersion)
      .set({ status: 'published', publishedAt: new Date() })
      .where(eq(indicatorVersion.id, versionId));

    const response = await confirm(indicatorId, batchId);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'no_draft' });
    const [version] = await ownerDb
      .select()
      .from(indicatorVersion)
      .where(eq(indicatorVersion.id, versionId));
    expect(version?.dataTableConfirmedAt).toBeNull();
  });

  it("confirms an update draft's copy of the published batch on the draft alone", async () => {
    const published = await seededPublished(1);
    await ownerDb
      .update(indicatorVersion)
      .set({ dataTableConfirmedAt: null })
      .where(eq(indicatorVersion.id, published.id));
    await createDraftFromPublished(internalDb, published.indicatorId, AS_ACTOR);
    const draft = await draftOf(ownerDb, published.indicatorId);

    const response = await confirm(published.indicatorId, draft.uploadBatchId ?? '');

    expect(response.status).toBe(200);
    const [publishedAfter] = await ownerDb
      .select()
      .from(indicatorVersion)
      .where(eq(indicatorVersion.id, published.id));
    expect(publishedAfter?.dataTableConfirmedAt).toBeNull();
  });

  it('refuses a batch that is not a uuid', async () => {
    const { indicatorId } = await newDraft(internalDb, 'Confirm a bad id');

    const response = await confirm(indicatorId, 'not-a-batch');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'validation_failed' });
  });
});

describe('confirmDataTable', () => {
  it('refuses when an upload repoints the draft while the confirmation waits on it', async () => {
    const { indicatorId, versionId } = await newDraft(internalDb, 'Confirm during upload');
    const shown = await load(indicatorId);
    const replacement = randomUuidV7();

    // The end of an upload adds its batch and points the draft at it. The confirmation waits
    // for that to commit, then sees the new batch.
    const confirmed = await ownerDb.$client.begin(async (tx) => {
      await tx`
        INSERT INTO upload_batch
          (id, indicator_id, indicator_version_id, original_filename, uploaded_by, status)
        VALUES (${replacement}, ${indicatorId}, ${versionId}, 'data.csv', ${ACTOR}, 'processed')`;
      await tx`UPDATE indicator_version SET upload_batch_id = ${replacement} WHERE id = ${versionId}`;
      const waiting = confirmDataTable(internalDb, indicatorId, shown, AS_ACTOR);
      await lockWaited(ownerDb);
      return { waiting };
    });

    expect(await confirmed.waiting).toEqual({ ok: false, reason: 'data_table_changed' });
    expect(await draftOf(ownerDb, indicatorId)).toMatchObject({
      uploadBatchId: replacement,
      dataTableConfirmedAt: null,
    });
  });

  it('confirms once a section save holding the draft commits', async () => {
    const { indicatorId, versionId } = await newDraft(internalDb, 'Confirm beside a save');
    const shown = await load(indicatorId);

    const confirmed = await ownerDb.$client.begin(async (tx) => {
      await tx`UPDATE indicator_version SET definition = 'Saved meanwhile' WHERE id = ${versionId}`;
      const waiting = confirmDataTable(internalDb, indicatorId, shown, AS_ACTOR);
      await lockWaited(ownerDb);
      return { waiting };
    });

    expect(await confirmed.waiting).toMatchObject({ ok: true });
    expect((await draftOf(ownerDb, indicatorId)).definition).toBe('Saved meanwhile');
  });
});
