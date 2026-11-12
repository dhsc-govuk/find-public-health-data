// @vitest-environment jsdom

import type { LoaderFunctionArgs } from 'react-router';
import { expect, it, vi } from 'vitest';
import { loadTopic } from './loader.ts';
import { loader } from './table-csv-route.ts';

vi.mock('./loader.ts', () => ({ loadTopic: vi.fn() }));

it.each([
  ['no-polarity', 'No comparison available'],
  ['higher-is-better', 'Better than England'],
] as const)('exports the visible judgement for %s indicators', async (polarity, label) => {
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
  ['higher-is-better', 'Better than England'],
  ['no-polarity', 'Neither better nor worse'],
] as const)(
  'exports England and the %s comparison summary from the data tab',
  async (polarity, label) => {
    const observation = (value: number) => ({
      fromDate: '2024-01-01',
      toDate: '2024-12-31',
      value,
      count: value * 10,
      numerator: null,
      denominator: null,
      dimensions: [],
      notes: [],
      lowerCi95: value - 1,
      upperCi95: value + 1,
      lowerCi998: null,
      upperCi998: null,
    });
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
                dataUpdatedAt: null,
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
      request: new Request(
        'http://local/topics/example/table.csv?tab-topic=data&columns-topic=count,value',
      ),
    } as LoaderFunctionArgs);
    const lines = (await response.text()).trim().split(/\r?\n/);
    expect(lines[0]).toBe(
      'Indicator,Subtopic,Unit,North East count,North East calculated value,North East period,North East comparison summary,England count,England calculated value',
    );
    expect(lines[1]).toBe(`Example indicator,,%,200,20,2024,${label},100,10`);
  },
);

it('adds the England and comparison columns when only a later indicator has data for the picked area', async () => {
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
  const detail = (shortId: number, name: string) => ({
    shortId,
    slug: name.toLowerCase(),
    name,
    unit: '%',
    yearType: null,
    polarity: 'higher-is-better',
    comparatorMethod: 'Confidence intervals overlapping reference value',
    topics: [],
    dataUpdatedAt: null,
  });
  vi.mocked(loadTopic).mockResolvedValue({
    topic: { slug: 'example', title: 'Example' },
    content: {
      data: {
        selected: [
          {
            detail: detail(1, 'England only'),
            areaData: [
              { areaCode: 'E92000001', areaName: 'England', observations: [observation(10)] },
            ],
          },
          {
            detail: detail(2, 'Both'),
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
    request: new Request(
      'http://local/topics/example/table.csv?tab-topic=data&columns-topic=value',
    ),
  } as LoaderFunctionArgs);
  const lines = (await response.text()).trim().split(/\r?\n/);
  expect(lines[0]).toBe(
    'Indicator,Subtopic,Unit,North East calculated value,North East period,North East comparison summary,England calculated value',
  );
  expect(lines).toHaveLength(3);
  expect(lines[2]).toBe('Both,,%,20,2024,Better than England,10');
});
