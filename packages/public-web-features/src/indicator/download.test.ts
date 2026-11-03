import { expect, it } from 'vitest';
import { tableCsv, trendCsv } from './download.ts';
import type { IndicatorDetail } from './loader.ts';
import { trendTableModel } from './trend.ts';

it('escapes formula-like text while retaining negative numeric cells', () => {
  expect(
    tableCsv([
      ['=SUM(1)', '+test', '-test', '@test', '\tformula', '\rformula'],
      [-2.5, 0, null, 'Plain text', 'with,comma', '"quoted"'],
    ]),
  ).toBe(
    '\'=SUM(1),\'+test,\'-test,\'@test,\'\tformula,\'\rformula\n-2.5,0,,Plain text,"with,comma","""quoted"""\n',
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
            numerator: null,
            denominator: null,
            notes: [],
            dimensions: [],
          },
        ],
      },
    ],
    confidence: 'none',
  });

  expect(trendCsv(indicator, model, 'none', false)).toBe(
    "Period,'=SUM(1) calculated value\n2023,-2.5\n",
  );
});
