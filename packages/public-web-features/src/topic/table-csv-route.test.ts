// @vitest-environment jsdom

import type { LoaderFunctionArgs } from 'react-router';
import { expect, it, vi } from 'vitest';
import { indicatorDetail } from '../indicator/view.testing.ts';
import { loadTopic } from './loader.ts';
import { loader } from './table-csv-route.ts';

vi.mock('./loader.ts', () => ({ loadTopic: vi.fn() }));

const observation = (value: number) => ({
  fromDate: '2024-01-01',
  toDate: '2024-12-31',
  value,
  count: null,
  numerator: null,
  denominator: null,
  dimensions: [],
  notes: [],
  lowerCi95: value - 1,
  upperCi95: value + 1,
  lowerCi998: null,
  upperCi998: null,
});

it('exports No data as the latest period for indicators without observations', async () => {
  vi.mocked(loadTopic).mockResolvedValue({
    topic: { slug: 'example', title: 'Example' },
    content: {
      data: {
        selected: [
          {
            detail: indicatorDetail(1, { name: 'No observations' }),
            areaData: [
              { areaCode: 'E92000001', areaName: 'England', observations: [] },
              { areaCode: 'E12000001', areaName: 'North East', observations: [] },
            ],
          },
        ],
        benchmarkGeography: { regionByCode: {}, levelByCode: {} },
      },
    },
  } as unknown as Awaited<ReturnType<typeof loadTopic>>);
  const response = await loader({
    request: new Request('http://local/topics/example/table.csv?tab-topic=areas'),
  } as LoaderFunctionArgs);
  const rows = (await response.text())
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(','));
  expect(rows[0]?.[2]).toBe('Latest period');
  expect(rows[1]?.[0]).toBe('No observations');
  expect(rows[1]?.[2]).toBe('No data');
});

it.each([
  ['no-polarity', 'No comparison available'],
  ['higher-is-better', 'Better than England'],
] as const)('exports the visible judgement for %s indicators', async (polarity, label) => {
  vi.mocked(loadTopic).mockResolvedValue({
    topic: { slug: 'example', title: 'Example' },
    content: {
      data: {
        selected: [
          {
            detail: {
              shortId: 1,
              slug: 'example',
              name: 'Example indicator',
              unit: '%',
              yearType: null,
              polarity,
              comparatorMethod: 'Confidence intervals overlapping reference value',
              topics: [],
            },
            areaData: [
              { areaCode: 'E92000001', areaName: 'England', observations: [observation(10)] },
              { areaCode: 'E12000001', areaName: 'North East', observations: [observation(20)] },
            ],
          },
        ],
        benchmarkGeography: { regionByCode: {}, levelByCode: {} },
      },
    },
  } as unknown as Awaited<ReturnType<typeof loadTopic>>);
  const response = await loader({
    request: new Request('http://local/topics/example/table.csv?tab-topic=areas'),
  } as LoaderFunctionArgs);
  const lines = (await response.text()).trim().split(/\r?\n/);
  expect(lines).toHaveLength(2);
  expect(lines[0]).toContain('North East comparison');
  expect(lines[1]).toContain(label);
  expect(lines[1]).toContain('Example indicator,%,2024,10,2024,20,2024,');
});

it.each([
  ['lower-is-better', 'first', ['North East', 'London'], [10, 20], [40, 30]],
  ['lower-is-better', 'reverse', ['London', 'North East'], [20, 10], [30, 40]],
  ['higher-is-better', 'first', ['London', 'North East'], [20, 10], [30, 40]],
  ['higher-is-better', 'reverse', ['North East', 'London'], [10, 20], [40, 30]],
  ['no-polarity', 'first', ['London', 'North East'], [20, 10], [30, 40]],
  ['no-polarity', 'reverse', ['North East', 'London'], [10, 20], [40, 30]],
] as const)(
  'exports sorted rows and aligned %s area columns in %s order',
  async (polarity, direction, areas, first, second) => {
    vi.mocked(loadTopic).mockResolvedValue({
      topic: { slug: 'example', title: 'Example' },
      content: {
        data: {
          selected: ['Zebra', 'Alpha'].map((name, index) => ({
            detail: {
              shortId: index + 1,
              slug: name.toLowerCase(),
              name,
              unit: '%',
              yearType: null,
              polarity,
              topics: [],
            },
            areaData: [
              { areaCode: 'E92000001', areaName: 'England', observations: [observation(25)] },
              {
                areaCode: 'E12000007',
                areaName: 'London',
                observations: [observation(20 + index * 10)],
              },
              {
                areaCode: 'E12000001',
                areaName: 'North East',
                observations: [observation(10 + index * 30)],
              },
            ],
          })),
          benchmarkGeography: { regionByCode: {}, levelByCode: {} },
        },
      },
    } as unknown as Awaited<ReturnType<typeof loadTopic>>);
    const response = await loader({
      request: new Request(
        `http://local/topics/example/table.csv?tab-topic=areas&areaRowSort=name-asc&sortAreas=${direction}:1|`,
      ),
    } as LoaderFunctionArgs);
    const rows = (await response.text())
      .trim()
      .split(/\r?\n/)
      .map((line) => line.split(','));
    expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('Content-Disposition')).toBe(
      'attachment; filename="example-area-summaries.csv"',
    );
    expect(rows[0]?.filter((_, index) => index >= 5 && (index - 5) % 4 === 0)).toEqual(areas);
    expect(rows.slice(1).map((row) => row[0])).toEqual(['Alpha', 'Zebra']);
    expect(rows[1]?.filter((_, index) => index >= 5 && (index - 5) % 4 === 0).map(Number)).toEqual(
      second,
    );
    expect(rows[2]?.filter((_, index) => index >= 5 && (index - 5) % 4 === 0).map(Number)).toEqual(
      first,
    );
  },
);

it.each(['', '&sortAreas=first:1|', '&sortAreas=first:missing'])(
  'keeps sparse area values under their own CSV headers with %s',
  async (sort) => {
    vi.mocked(loadTopic).mockResolvedValue({
      topic: { slug: 'example', title: 'Example' },
      content: {
        data: {
          selected: [
            {
              detail: indicatorDetail(1, { name: 'Both areas' }),
              areaData: [
                { areaCode: 'E12000007', areaName: 'London', observations: [observation(20)] },
                { areaCode: 'E12000001', areaName: 'North East', observations: [observation(10)] },
              ],
            },
            {
              detail: indicatorDetail(2, { name: 'North East only' }),
              areaData: [
                { areaCode: 'E12000001', areaName: 'North East', observations: [observation(40)] },
                { areaCode: 'E12000002', areaName: 'North West', observations: [observation(30)] },
              ],
            },
          ],
          benchmarkGeography: { regionByCode: {}, levelByCode: {} },
        },
      },
    } as unknown as Awaited<ReturnType<typeof loadTopic>>);
    const response = await loader({
      request: new Request(`http://local/topics/example/table.csv?tab-topic=areas${sort}`),
    } as LoaderFunctionArgs);
    const [headers = [], ...rows] = (await response.text())
      .trim()
      .split(/\r?\n/)
      .map((line) => line.split(','));
    expect(headers).toContain('North West');
    expect(rows.every((row) => row.length === headers.length)).toBe(true);
    const sparse = rows.find((row) => row[0] === 'North East only');
    expect(sparse?.[headers.indexOf('London')]).toBe('');
    expect(sparse?.[headers.indexOf('London period')]).toBe('No data');
    expect(sparse?.[headers.indexOf('London comparison')]).toBe('No data');
    expect(sparse?.[headers.indexOf('North East')]).toBe('40');
    expect(sparse?.[headers.indexOf('North West')]).toBe('30');
  },
);

it.each(['', 'data', 'overview', 'publications', 'unknown'])(
  'defaults non-area download tab %s to data with explicit data columns',
  async (tab) => {
    vi.mocked(loadTopic).mockResolvedValue({
      topic: { slug: 'example', title: 'Example' },
      content: {
        data: {
          selected: [{ detail: indicatorDetail(1), areaData: [] }],
          benchmarkGeography: { regionByCode: {}, levelByCode: {} },
        },
      },
    } as unknown as Awaited<ReturnType<typeof loadTopic>>);
    const response = await loader({
      request: new Request(
        `http://local/topics/example/table.csv?tab-topic=${tab}&sortAreas=first:1|`,
      ),
    } as LoaderFunctionArgs);
    const args = vi.mocked(loadTopic).mock.lastCall?.[0];
    expect(new URL(args?.request.url ?? '').searchParams.get('tab-topic')).toBe('data');
    expect(response.headers.get('Content-Disposition')).toBe(
      'attachment; filename="example-data.csv"',
    );
    expect((await response.text()).split(/\r?\n/)[0]).toBe(
      'Indicator,Subtopic,Unit,Most recent period,Last updated',
    );
  },
);
