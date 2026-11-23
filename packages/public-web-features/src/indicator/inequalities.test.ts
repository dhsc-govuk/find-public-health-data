import { describe, expect, it } from 'vitest';
import { sexedInequalities } from './inequalities.testing.ts';
import { inequalityTableModel } from './inequalities.ts';
import { observation, selected, sex } from './view.testing.ts';

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

  it.each([
    ['Female', [22, 24], 20, ['Deprivation decile', 'Disability', 'Ethnic groups'], 2023],
    ['Male', [42, 44], 40, ['Deprivation decile', 'Ethnic groups'], 2022],
  ] as const)(
    'selects %s rows, England and options before inferring the baseline',
    (sexValue, values, benchmark, categories, earlier) => {
      const model = inequalityTableModel(
        sexedInequalities(),
        new URLSearchParams(`sex-90632=${sexValue}&ic-90632=Ethnic+groups`),
      );
      expect(model.rows.map(({ value }) => value)).toEqual(values);
      expect(
        model.rows.every(({ dimensions }) =>
          dimensions.some(({ type, value }) => type === 'Sex' && value === sexValue),
        ),
      ).toBe(true);
      expect(model.benchmark?.value).toBe(benchmark);
      expect(model.benchmark?.count).toBe(benchmark * 100);
      expect(model.benchmark?.dimensions).toEqual([sex(sexValue)]);
      expect(model.categories).toEqual(categories);
      expect(model.periods.map(({ value }) => value)).toEqual([
        `${earlier}-01-01/${earlier}-12-31`,
        '2024-01-01/2024-12-31',
      ]);
    },
  );

  it('resolves a stale category and period within the selected sex', () => {
    const model = inequalityTableModel(
      sexedInequalities(),
      new URLSearchParams('sex-90632=Male&ic-90632=Disability&ip-90632=2023-01-01/2023-12-31'),
    );
    expect(model.category).toBe('Deprivation decile');
    expect(model.period).toBe('2024-01-01/2024-12-31');
    expect(model.rows.map(({ value }) => value)).toEqual([46]);
    expect(model.benchmark?.value).toBe(40);
  });

  it('offers only the selected sex categories and periods', () => {
    const model = inequalityTableModel(
      sexedInequalities(),
      new URLSearchParams('sex-90632=Male&ic-90632=Ethnic+groups'),
    );
    expect(model.categories).toEqual(['Deprivation decile', 'Ethnic groups']);
    expect(model.periods.map(({ value }) => value)).toEqual([
      '2022-01-01/2022-12-31',
      '2024-01-01/2024-12-31',
    ]);
  });

  it('prefers a geography with inequality data for the selected sex', () => {
    const indicator = selected(90632);
    indicator.detail = sexedInequalities().detail;
    indicator.areaData.push({
      areaCode: 'E06000001',
      areaName: 'Hartlepool',
      observations: sexedInequalities().areaData.flatMap(({ observations }) => observations),
    });
    const model = inequalityTableModel(indicator, new URLSearchParams('sex-90632=Male'));
    expect(model.area?.areaName).toBe('Hartlepool');
    expect(model.areas.map(({ areaName }) => areaName)).toEqual(['Hartlepool']);
    expect(model.rows.map(({ value }) => value)).toEqual([46]);
    expect(model.benchmark?.value).toBe(40);
  });

  it('keeps sexless Persons as the default even with longer sex-specific histories', () => {
    const model = inequalityTableModel(
      sexedInequalities(),
      new URLSearchParams('ic-90632=Ethnic+groups'),
    );
    expect(model.rows.map(({ value }) => value)).toEqual([52, 54]);
    expect(model.benchmark?.value).toBe(50);
    expect(model.benchmark?.dimensions).toEqual([]);
  });

  it('selects published Male rows when the unfiltered headline would choose Female', () => {
    const indicator = sexedInequalities();
    for (const area of indicator.areaData) {
      area.observations = area.observations.filter(({ dimensions }) =>
        dimensions.some(({ type }) => type === 'Sex'),
      );
    }
    const model = inequalityTableModel(
      indicator,
      new URLSearchParams('sex-90632=Male&ic-90632=Ethnic+groups'),
    );
    expect(model.rows.map(({ value }) => value)).toEqual([42, 44]);
    expect(model.benchmark?.value).toBe(40);
  });

  it.each([false, true])(
    'keeps the longest headline and first tie without Persons: longer Male %s',
    (longerMale) => {
      const indicator = sexedInequalities();
      for (const area of indicator.areaData) {
        area.observations = area.observations.filter(({ dimensions }) =>
          dimensions.some(({ type }) => type === 'Sex'),
        );
        if (longerMale)
          area.observations.push({
            ...observation(38, [sex('Male')]),
            fromDate: '2021-01-01',
            toDate: '2021-12-31',
          });
      }
      const model = inequalityTableModel(indicator, new URLSearchParams('ic-90632=Ethnic+groups'));
      expect(model.rows.map(({ value }) => value)).toEqual(longerMale ? [42, 44] : [22, 24]);
      expect(model.benchmark?.value).toBe(longerMale ? 40 : 20);
    },
  );

  it('does not substitute another sex when a valid Male selection has no breakdown', () => {
    const indicator = selected(90632);
    indicator.detail = sexedInequalities().detail;
    const model = inequalityTableModel(indicator, new URLSearchParams('sex-90632=Male'));
    expect(model.sex).toBe('Male');
    expect(model.rows).toEqual([]);
    expect(model.categories).toEqual([]);
    expect(model.periods).toEqual([]);
    expect(model.benchmark).toBeUndefined();
  });

  it('falls back to the default Persons view for an invalid or stale sex', () => {
    const indicator = sexedInequalities();
    const model = inequalityTableModel(
      indicator,
      new URLSearchParams('sex-90632=Unpublished&ic-90632=Ethnic+groups'),
    );
    expect(model.sex).toBe('');
    expect(model.rows.map(({ value }) => value)).toEqual([52, 54]);
    expect(model.benchmark?.value).toBe(50);
    expect(model).toEqual(
      inequalityTableModel(indicator, new URLSearchParams('ic-90632=Ethnic+groups')),
    );
  });
});
