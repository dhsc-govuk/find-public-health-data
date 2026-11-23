import type { LoaderFunctionArgs } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sexedInequalities } from './inequalities.testing.ts';
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

async function csvText(response: Response): Promise<string> {
  return new TextDecoder('utf-8', { ignoreBOM: true }).decode(await response.arrayBuffer());
}

describe('indicator view CSV', () => {
  it.each(['england', 'quintiles'])(
    'exports rounded values, missing data and the source in Excel format in %s mode',
    async (colour) => {
      const data = await loadIndicator(args(''));
      vi.mocked(loadIndicator).mockResolvedValue({
        ...data,
        selected: [
          {
            ...primary,
            detail: {
              ...primary.detail,
              polarity: 'no-polarity',
              dataSource: { name: 'Example, "quoted" source', url: null },
            },
            areaData: [
              {
                areaCode: 'E92000001',
                areaName: 'England',
                observations: [{ ...observation(7.94), lowerCi95: 7.9, upperCi95: 7.94 }],
              },
            ],
          },
        ],
        compareAreasData: [
          {
            areaCode: 'E10000032',
            areaName: 'West Sussex',
            observations: [{ ...observation(7.94), lowerCi95: 7.89, upperCi95: 7.99 }],
          },
          {
            areaCode: 'E06000052',
            areaName: 'Cornwall',
            observations: [{ ...observation(7.64), lowerCi95: 7.54, upperCi95: 7.74 }],
          },
          { areaCode: 'E06000002', areaName: 'Missing', observations: [] },
        ],
      });
      const response = await loadIndicatorViewCsv(args(`tab-indicator=areas&areaColour=${colour}`));
      expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
      expect(await csvText(response)).toBe(
        `\uFEFFArea,Value (%),${colour === 'quintiles' ? 'Quintile' : 'Compared with England'},95% lower confidence interval,95% upper confidence interval\r\n` +
          'England (benchmark),7.9,,7.9,7.9\r\n' +
          `West Sussex,7.9,${colour === 'quintiles' ? 'Quintile 3' : 'Similar'},7.9,8.0\r\n` +
          `Cornwall,7.6,${colour === 'quintiles' ? 'Quintile 1 (lowest)' : 'Lower'},7.5,7.7\r\n` +
          'Missing,,No data,,\r\n' +
          '\r\n' +
          '"Source: Example, ""quoted"" source"\r\n',
      );
    },
  );
  it('omits the footer when there is no data source', async () => {
    const response = await loadIndicatorViewCsv(args('tab-indicator=areas'));
    expect(await csvText(response)).toBe(
      '\uFEFFArea,Value (%),Compared with England,95% lower confidence interval,95% upper confidence interval\r\n' +
        'England (benchmark),40.0,,39.0,41.0\r\n' +
        'Cornwall,30.0,Worse,29.0,31.0\r\n' +
        'Hartlepool,10.0,Worse,9.0,11.0\r\n',
    );
  });
  it('exports negative values and intervals without formula escapes or thousands separators', async () => {
    const data = await loadIndicator(args(''));
    vi.mocked(loadIndicator).mockResolvedValue({
      ...data,
      compareAreasData: [
        {
          areaCode: 'E06000052',
          areaName: 'Cornwall',
          observations: [{ ...observation(-1234.04), lowerCi95: -1234.96, upperCi95: -1233.94 }],
        },
      ],
    });
    const response = await loadIndicatorViewCsv(args('tab-indicator=areas'));
    expect(await csvText(response)).toBe(
      '\uFEFFArea,Value (%),Compared with England,95% lower confidence interval,95% upper confidence interval\r\n' +
        'England (benchmark),40.0,,39.0,41.0\r\n' +
        'Cornwall,-1234.0,Worse,-1235.0,-1233.9\r\n',
    );
  });
  it.each([
    ['', ''],
    ['&highlight=E06000052', '-cornwall'],
    ['&highlight=E06000052&highlight=E06000052', '-cornwall'],
    ['&highlightRegion=E12000001', '-hartlepool'],
    ['&highlight=E06000052&highlight=E06000001', '-2-chosen-areas'],
    ['&highlightRegion=E12000009&highlightRegion=E12000001', '-2-chosen-areas'],
    ['&highlight=E92000001', ''],
    ['&highlight=E06000052&highlight=E92000001&highlight=E99999999', '-cornwall'],
  ])('names the download using the highlighted areas for %s', async (query, suffix) => {
    const response = await loadIndicatorViewCsv(args(`tab-indicator=areas${query}`));
    expect(response.headers.get('Content-Disposition')).toBe(
      `attachment; filename="table-of-area-comparisons-indicator-108${suffix}.csv"`,
    );
  });
  it('slugs caption punctuation and leaves out highlights the table does not list', async () => {
    const data = await loadIndicator(args(''));
    vi.mocked(loadIndicator).mockResolvedValue({
      ...data,
      selected: [{ ...primary, detail: { ...primary.detail, name: ' Rate: "Café" & costs (€) ' } }],
      compareAreasData: [],
    });
    const response = await loadIndicatorViewCsv(args('tab-indicator=areas&highlight=E06000052'));
    expect(response.headers.get('Content-Disposition')).toBe(
      'attachment; filename="table-of-area-comparisons-rate-caf-costs.csv"',
    );
  });
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
      .split('\r\n');
    expect(lines[0]).toBe('Area,Value (%),Compared with England');
    expect(lines.every((line) => line.split(',').length === 3)).toBe(true);
  });

  it('exports England and its intervals when England is the only area with intervals', async () => {
    const data = await loadIndicator(args(''));
    vi.mocked(loadIndicator).mockResolvedValue({
      ...data,
      compareAreasData: areas.map((area) => ({
        ...area,
        observations: area.observations.map((observation) => ({
          ...observation,
          lowerCi95: null,
          upperCi95: null,
        })),
      })),
    });
    const lines = (await (await loadIndicatorViewCsv(args('tab-indicator=areas'))).text())
      .trim()
      .split('\r\n');
    expect(lines[0]).toBe(
      'Area,Value (%),Compared with England,95% lower confidence interval,95% upper confidence interval',
    );
    expect(lines).toContain('England (benchmark),40.0,,39.0,41.0');
    expect(
      lines
        .find((line) => line.startsWith('Cornwall,'))
        ?.split(',')
        .slice(3),
    ).toEqual(['', '']);
    expect(lines.every((line) => line.split(',').length === 5)).toBe(true);
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
      .split('\r\n');
    expect(lines[0]).toContain('95% lower confidence interval');
    expect(lines.some((line) => line.startsWith('Cornwall'))).toBe(false);
    expect(lines.every((line) => line.split(',').length === 5)).toBe(true);
  });
  it('exports the area table in the selected sort and colour order', async () => {
    const response = await loadIndicatorViewCsv(
      args('tab-indicator=areas&areaSort=alphabetical&areaColour=quintiles'),
    );
    const lines = (await response.text()).trim().split('\r\n');
    expect(lines[0]).toBe(
      'Area,Value (%),Quintile,95% lower confidence interval,95% upper confidence interval',
    );
    expect(lines.slice(1)).toMatchInlineSnapshot(`
      [
        "England (benchmark),40.0,,39.0,41.0",
        "Cornwall,30.0,Quintile 3,29.0,31.0",
        "Hartlepool,10.0,Quintile 1 (lowest),9.0,11.0",
      ]
    `);
  });
  it('exports highlighted areas ahead of England, as the table shows them', async () => {
    const response = await loadIndicatorViewCsv(
      args('tab-indicator=areas&areaSort=descending&highlightRegion=E12000001'),
    );
    const lines = (await response.text()).trim().split('\r\n');
    expect(lines.slice(1)).toMatchInlineSnapshot(`
      [
        "Hartlepool,10.0,Worse,9.0,11.0",
        "England (benchmark),40.0,,39.0,41.0",
        "Cornwall,30.0,Worse,29.0,31.0",
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

  it.each([
    ['Female', 20, [22, 24]],
    ['Male', 40, [42, 44]],
  ] as const)(
    'exports only %s inequalities and its England benchmark',
    async (sexValue, benchmark, values) => {
      const data = await loadIndicator(args(''));
      vi.mocked(loadIndicator).mockResolvedValue({ ...data, selected: [sexedInequalities()] });
      const response = await loadIndicatorViewCsv(
        args(`tab-indicator=inequalities&sex-90632=${sexValue}&ic-90632=Ethnic+groups`),
      );
      expect((await response.text()).trim().split('\n')).toEqual([
        'Segment,Count,Value (%),Compared with England',
        `England,${benchmark * 100},${benchmark},Benchmark`,
        `White,${values[0] * 100},${values[0]},Similar to England`,
        `Asian,${values[1] * 100},${values[1]},Better than England`,
      ]);
    },
  );

  it('exports the selected sex period rather than another sex default', async () => {
    const data = await loadIndicator(args(''));
    vi.mocked(loadIndicator).mockResolvedValue({ ...data, selected: [sexedInequalities()] });
    const response = await loadIndicatorViewCsv(
      args(
        'tab-indicator=inequalities&sex-90632=Male&ic-90632=Ethnic+groups&ip-90632=2022-01-01/2022-12-31',
      ),
    );
    expect((await response.text()).trim().split('\n')).toEqual([
      'Segment,Count,Value (%),Compared with England',
      'England,3900,39,Benchmark',
      'White,4100,41,Similar to England',
    ]);
  });

  it('exports no substitute data for a sex with no inequality breakdown', async () => {
    const response = await loadIndicatorViewCsv(args('tab-indicator=inequalities&sex-108=Male'));
    expect((await response.text()).trim().split('\n')).toEqual([
      'Segment,Value (%),Compared with England',
      'England,,Benchmark',
    ]);
  });
});
