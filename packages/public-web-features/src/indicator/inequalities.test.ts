import { describe, expect, it } from 'vitest';
import { inequalityTableModel } from './inequalities.ts';
import { selected } from './view.testing.ts';

describe('inequality table model', () => {
  it('chooses a published breakdown area and aligns England to its sex and period', () => {
    const model = inequalityTableModel(selected(), new URLSearchParams());
    expect(model.area?.areaName).toBe('Cornwall');
    expect(model.rows.map(({ value }) => value)).toEqual([32]);
    expect(model.benchmark?.value).toBe(20);
    expect(model.benchmark?.count).toBe(2000);
    expect(model.comparisonConfidence).toBe('99.8');
  });
  it('uses the same category, period and confidence fallbacks for stale views', () => {
    const model = inequalityTableModel(
      selected(),
      new URLSearchParams('ig-108=unknown&ic-108=unpublished&ip-108=missing&ci-108=invalid'),
    );
    expect(model.category).toBe('Deprivation decile');
    expect(model.period).toBe('2024-01-01/2024-12-31');
    expect(model.confidence).toBe('none');
    expect(model.comparisonConfidence).toBe('none');
  });
  it('shows the first area rather than an England with no value', () => {
    const indicator = selected();
    indicator.areaData = [
      { areaCode: 'E12000001', areaName: 'North East', observations: [] },
      { areaCode: 'E92000001', areaName: 'England', observations: [] },
    ];
    const model = inequalityTableModel(indicator, new URLSearchParams());
    expect(model.area?.areaName).toBe('North East');
    expect(model.areas.map(({ areaName }) => areaName)).toEqual(['North East']);
  });
  it('keeps judging at the best available level when intervals are hidden', () => {
    const indicator = selected();
    for (const { observations } of indicator.areaData) {
      for (const row of observations) {
        row.lowerCi95 = null;
        row.upperCi95 = null;
      }
    }
    const shown = inequalityTableModel(indicator, new URLSearchParams()).rows.map(
      ({ comparison }) => comparison,
    );
    const hidden = inequalityTableModel(indicator, new URLSearchParams('ci-108=none'));
    expect(shown).not.toContain('none');
    expect(hidden.confidence).toBe('none');
    expect(hidden.rows.map(({ comparison }) => comparison)).toEqual(shown);
  });
  it('does not compare with another sex when England lacks the matching segment', () => {
    const indicator = selected();
    const england = indicator.areaData[0];
    if (!england) throw new Error('Missing test England series');
    england.observations = england.observations.filter(({ value }) => value !== 20);
    expect(inequalityTableModel(indicator, new URLSearchParams()).benchmark).toBeUndefined();
  });
});

it.each([false, true])('matches England to the shown period type with annual=%s', (annual) => {
  const indicator = selected();
  const england = indicator.areaData.find(({ areaCode }) => areaCode === 'E92000001');
  const matching = england?.observations.find(({ value }) => value === 20);
  if (!england || !matching) throw new Error('Missing England fixture');
  england.observations = [
    ...england.observations.filter(({ value }) => value !== 20),
    ...(annual ? [matching] : []),
    { ...matching, fromDate: '2022-01-01', value: 90 },
  ];
  const model = inequalityTableModel(indicator, new URLSearchParams());
  expect(model.benchmark?.value).toBe(annual ? 20 : undefined);
  if (!annual) expect(model.rows.every(({ comparison }) => comparison === 'none')).toBe(true);
});
