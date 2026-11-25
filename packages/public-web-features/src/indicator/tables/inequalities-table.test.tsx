// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { IndicatorDetail } from '../loader.ts';
import { InequalitiesTable } from './inequalities-table.tsx';

afterEach(cleanup);

function indicator(unit: string | null) {
  return { unit, yearType: { value: 'calendar', label: 'Calendar' } } as IndicatorDetail;
}

const observations = [
  {
    fromDate: '2023-01-01',
    toDate: '2023-12-31',
    value: 12.3,
    comparison: 'worse' as const,
    lowerCi95: null,
    upperCi95: null,
    lowerCi998: null,
    upperCi998: null,
    count: null,
    denominator: null,
    notes: [],
    dimensions: [{ type: 'Sex', value: 'Female', dimensionClass: 'inequality', sortOrder: 0 }],
  },
];

describe('InequalitiesTable', () => {
  it.each(['95', '99.8'] as const)(
    'uses the shared Proportion formatter for %s limits',
    (confidence) => {
      const points = observations.map((point) => ({
        ...point,
        lowerCi95: 4.0368,
        upperCi95: 120.4115,
        lowerCi998: 72042.0954,
        upperCi998: 72939.9819,
      }));
      render(
        <InequalitiesTable
          confidence={confidence}
          indicator={{ ...indicator('%'), valueType: 'Proportion' }}
          observations={points}
        />,
      );
      expect(screen.getByText(confidence === '95' ? '4.0 to 100' : '100 to 100')).toBeTruthy();
      expect(points[0]?.upperCi95).toBe(120.4115);
    },
  );

  it.each([
    ['with no unit', null, 'Value'],
    ['per 100,000', 'per 100,000', 'Value (per 100,000)'],
  ])('heads values %s', (_, unit, heading) => {
    render(
      <InequalitiesTable
        confidence="none"
        indicator={indicator(unit)}
        observations={observations}
      />,
    );

    const row = screen.getByRole('rowheader', { name: 'Female' }).closest('tr');

    expect(screen.getByRole('columnheader', { name: heading })).toBeTruthy();
    expect(within(row as HTMLElement).getByRole('cell').textContent).toBe('12.3');
  });

  it('compares with England under Count, with no Numerator column', () => {
    render(
      <InequalitiesTable
        benchmark={10}
        benchmarkMeasures={{ count: 900 }}
        confidence="none"
        indicator={indicator(null)}
        observations={observations.map((observation) => ({ ...observation, count: 41 }))}
      />,
    );

    const headers = screen.getAllByRole('columnheader').map(({ textContent }) => textContent);
    const female = screen.getByRole('rowheader', { name: 'Female' }).closest('tr');
    const england = screen.getByRole('rowheader', { name: 'England' }).closest('tr');

    expect(within(female as HTMLElement).getByText('Worse than England')).toBeTruthy();
    expect(headers).toContain('Count');
    expect(headers).not.toContain('Numerator');
    expect(within(female as HTMLElement).getAllByRole('cell')[0]?.textContent).toBe('41');
    expect(within(england as HTMLElement).getAllByRole('cell')[0]?.textContent).toBe('900');
  });

  it.each([
    ['with', { benchmark: 10 }],
    ['without', {}],
  ])('names the selected sex in the caption %s an England benchmark', (_, benchmark) => {
    render(
      <InequalitiesTable
        {...benchmark}
        confidence="none"
        indicator={indicator(null)}
        observations={observations}
        sex="Male"
      />,
    );

    expect(screen.getByRole('table').querySelector('caption')?.textContent).toContain('Male');
  });

  it('leaves the caption without a sex when none is selected', () => {
    render(
      <InequalitiesTable
        confidence="none"
        indicator={indicator(null)}
        observations={observations}
      />,
    );

    expect(screen.getByRole('table').querySelector('caption')?.textContent).toBe('Sex, 2023');
  });
});
