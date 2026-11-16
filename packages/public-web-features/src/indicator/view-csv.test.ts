import type { LoaderFunctionArgs } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadIndicator } from './loader.ts';
import { observation, selected } from './view.testing.ts';
import { loadIndicatorViewCsv } from './view-csv.ts';

vi.mock('./loader.ts', () => ({ loadIndicator: vi.fn() }));
const primary = selected();
const compared = selected(241);
const areas = [
  { areaCode: 'E06000052', areaName: 'Cornwall', observations: [observation(30)] },
  { areaCode: 'E06000001', areaName: 'Hartlepool', observations: [observation(10)] },
];
beforeEach(() =>
  vi.mocked(loadIndicator).mockResolvedValue({
    selected: [primary, compared],
    compareAreasData: areas,
    comparedAreasData: areas,
    compareAreaGroup: 'Local authorities',
    compareAreaOptions: [
      { code: 'E06000052', name: 'Cornwall', parent: { code: 'E12000009', name: 'South West' } },
      { code: 'E06000001', name: 'Hartlepool', parent: { code: 'E12000001', name: 'North East' } },
    ],
  } as Awaited<ReturnType<typeof loadIndicator>>),
);
function args(query: string): LoaderFunctionArgs {
  return {
    request: new Request(`http://localhost/indicator/indicator-108/table.csv?${query}`),
  } as LoaderFunctionArgs;
}

describe('indicator view CSV', () => {
  it.each(['england', 'quintiles'])(
    'keeps missing CSV values and comparisons blank in %s mode',
    async (colour) => {
      const data = await loadIndicator(args(''));
      vi.mocked(loadIndicator).mockResolvedValue({
        ...data,
        compareAreasData: [
          ...areas,
          { areaCode: 'E06000002', areaName: 'Missing', observations: [] },
        ],
      });
      const lines = (
        await (await loadIndicatorViewCsv(args(`tab-indicator=areas&areaColour=${colour}`))).text()
      ).split('\n');
      expect(lines).toContain('Missing,,,,');
    },
  );
  it('omits CI columns when the full area table has no intervals', async () => {
    const data = await loadIndicator(args(''));
    const withoutCi = (entries: typeof primary.areaData) =>
      entries.map((area) => ({
        ...area,
        observations: area.observations.map((observation) => ({
          ...observation,
          lowerCi95: null,
          upperCi95: null,
        })),
      }));
    vi.mocked(loadIndicator).mockResolvedValue({
      ...data,
      selected: [{ ...primary, areaData: withoutCi(primary.areaData) }],
      compareAreasData: withoutCi(areas),
    });
    const lines = (await (await loadIndicatorViewCsv(args('tab-indicator=areas'))).text())
      .trim()
      .split('\n');
    expect(lines[0]).toBe('Area,Value (%),Compared with England');
    expect(lines.every((line) => line.split(',').length === 3)).toBe(true);
  });

  it('keeps CI columns when filtering out the only area with intervals', async () => {
    const data = await loadIndicator(args(''));
    vi.mocked(loadIndicator).mockResolvedValue({
      ...data,
      selected: [
        {
          ...primary,
          areaData: primary.areaData.map((area) => ({
            ...area,
            observations: area.observations.map((observation) => ({
              ...observation,
              lowerCi95: null,
              upperCi95: null,
            })),
          })),
        },
      ],
      compareAreasData: [
        areas[0] as (typeof areas)[number],
        {
          ...(areas[1] as (typeof areas)[number]),
          observations: [{ ...observation(10), lowerCi95: null, upperCi95: null }],
        },
      ],
      compareAreaOptions: data.compareAreaOptions.map((area) => ({
        ...area,
        neighbours: ['E06000001'],
      })),
    });
    const lines = (
      await (
        await loadIndicatorViewCsv(
          args('tab-indicator=areas&highlight=E06000001&neighbours=E06000001'),
        )
      ).text()
    )
      .trim()
      .split('\n');
    expect(lines[0]).toContain('95% lower confidence interval');
    expect(lines.some((line) => line.startsWith('Cornwall'))).toBe(false);
    expect(lines.every((line) => line.split(',').length === 5)).toBe(true);
  });
  it('exports the area table in the selected sort and colour order', async () => {
    const response = await loadIndicatorViewCsv(
      args('tab-indicator=areas&areaSort=alphabetical&areaColour=quintiles'),
    );
    const lines = (await response.text()).trim().split('\n');
    expect(lines[0]).toBe(
      'Area,Value (%),Quintile,95% lower confidence interval,95% upper confidence interval',
    );
    expect(lines.slice(1)).toMatchInlineSnapshot(`
      [
        "England (benchmark),40,,39,41",
        "Cornwall,30,Quintile 3,29,31",
        "Hartlepool,10,Quintile 1 (lowest),9,11",
      ]
    `);
  });
  it('exports highlighted areas ahead of England, as the table shows them', async () => {
    const response = await loadIndicatorViewCsv(
      args('tab-indicator=areas&areaSort=descending&highlightRegion=E12000001'),
    );
    const lines = (await response.text()).trim().split('\n');
    expect(lines.slice(1)).toMatchInlineSnapshot(`
      [
        "Hartlepool,10,Worse,9,11",
        "England (benchmark),40,,39,41",
        "Cornwall,30,Worse,29,31",
      ]
    `);
  });
  it('exports the indicator pair with England, highlighted areas and the group range', async () => {
    const response = await loadIndicatorViewCsv(args('tab-indicator=compare&highlight=E06000052'));
    const lines = (await response.text()).trim().split('\n');
    expect(lines[0]).toBe('Area,Indicator 108 (%) (2024),Indicator 241 (%) (2024)');
    expect(lines).toContain('Cornwall,30,30');
    expect(lines).not.toContain('Hartlepool,10,10');
    expect(lines.at(-1)).toContain('Local authorities (2 areas)');
  });
  it('exports the displayed inequality area and matching England benchmark after stale filters', async () => {
    const response = await loadIndicatorViewCsv(
      args(
        'tab-indicator=inequalities&ig-108=E92000001&ic-108=unpublished&ip-108=missing&ci-108=95',
      ),
    );
    const lines = (await response.text()).trim().split('\n');
    expect(lines[0]).toBe('Segment,Count,Value (%),Compared with England');
    expect(lines[1]).toBe('England,2000,20,Benchmark');
    expect(lines[2]).toBe('Most deprived,3200,32,Better than England');
  });
});
