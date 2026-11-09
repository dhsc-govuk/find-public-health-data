// @vitest-environment jsdom

import type { LoaderFunctionArgs } from 'react-router';
import { expect, it, vi } from 'vitest';
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
  ['first', ['North East', 'London'], [10, 20], [40, 30]],
  ['reverse', ['London', 'North East'], [20, 10], [30, 40]],
] as const)(
  'exports sorted rows and aligned area columns in %s order',
  async (direction, areas, first, second) => {
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
              polarity: 'lower-is-better',
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
