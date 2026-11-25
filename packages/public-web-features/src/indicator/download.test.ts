import { expect, it } from 'vitest';
import { allDataCsv, tableCsv, trendCsv } from './download.ts';
import type { IndicatorDetail } from './loader.ts';
import { trendTableModel } from './trend.ts';
import { indicatorDetail, observation } from './view.testing.ts';

it('escapes formula-like text while retaining negative numeric cells', () => {
  expect(
    tableCsv([
      ['=SUM(1)', '+test', '-test', '@test', '\tformula', '\rformula'],
      [-2.5, 0, null, 'Plain text', 'with,comma', '"quoted"'],
    ]),
  ).toBe(
    '\'=SUM(1),\'+test,\'-test,\'@test,\'\tformula,"\'\rformula"\n-2.5,0,,Plain text,"with,comma","""quoted"""\n',
  );
});

it('adds a UTF-8 BOM and CRLF line endings for Excel when requested', () => {
  expect(
    tableCsv([['Area', 'Value'], ['Cornwall', -2.5], [], ['Source: Example']], { excel: true }),
  ).toBe('\uFEFFArea,Value\r\nCornwall,-2.5\r\n\r\nSource: Example\r\n');
});

it('preserves formatted numeric cells including trailing zeros and negatives', () => {
  expect(tableCsv([['-text', -8, 8, null]], { formatNumber: (value) => value.toFixed(1) })).toBe(
    "'-text,-8.0,8.0,\n",
  );
});

it('escapes a trend cell that starts with a formula character, keeping negative values', () => {
  const indicator = {
    unit: null,
    yearType: { value: 'calendar', label: 'Calendar' },
  } as IndicatorDetail;
  const model = trendTableModel({
    areaData: [
      {
        areaCode: 'E92000001',
        areaName: '=SUM(1)',
        observations: [
          {
            fromDate: '2023-01-01',
            toDate: '2023-12-31',
            value: -2.5,
            lowerCi95: null,
            upperCi95: null,
            lowerCi998: null,
            upperCi998: null,
            count: null,
            denominator: null,
            notes: [],
            dimensions: [],
          },
        ],
      },
    ],
    confidence: 'none',
  });

  expect(trendCsv(indicator, model, 'none')).toBe("Period,'=SUM(1) calculated value\n2023,-2.5\n");
});

it('keeps raw intervals at both levels in all-data and trend CSV downloads', () => {
  const indicator = indicatorDetail(90799, { valueType: 'Proportion' });
  const areaData = [
    {
      areaCode: 'E92000001',
      areaName: 'England',
      observations: [
        {
          ...observation(72.49),
          lowerCi95: 72042.0954,
          upperCi95: 72939.9819,
          lowerCi998: -2,
          upperCi998: 120.4115,
        },
      ],
    },
  ];
  expect(allDataCsv(indicator, areaData, () => 'Country')).toContain(
    '72.49,72042.0954,72939.9819,-2,120.4115',
  );
  const model = trendTableModel({ areaData, confidence: '95' });
  for (const level of ['95', '99.8'] as const) {
    const csv = trendCsv(indicator, model, level);
    expect(csv).toContain(level === '95' ? '72042.0954,72939.9819' : '-2,120.4115');
  }
});
