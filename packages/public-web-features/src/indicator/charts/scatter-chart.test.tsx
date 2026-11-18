// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { indicatorDetail, observation, selected } from '../view.testing.ts';
import { CompareIndicatorsChart } from './scatter-chart.tsx';

beforeEach(() =>
  vi.stubGlobal(
    'ResizeObserver',
    class {
      private callback: ResizeObserverCallback;
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
      }
      observe(target: Element) {
        this.callback(
          [{ target, contentRect: { width: 780, height: 560 } } as ResizeObserverEntry],
          this as unknown as ResizeObserver,
        );
      }
      unobserve() {}
      disconnect() {}
    },
  ),
);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const indicators = [selected(108), selected(241)].map((entry, index) => ({
  ...entry,
  detail: indicatorDetail(entry.detail.shortId, {
    name: index ? 'Mortality' : 'Prevalence',
    unit: index ? 'per 100,000' : '%',
  }),
  areaData: [{ areaCode: 'A', areaName: 'Area A', observations: [observation(index ? 20 : 10)] }],
}));
const point = (code: string, x: number, y: number) => ({
  code,
  name: code === 'E92000001' ? 'England' : `Area ${code}`,
  xPeriod: { fromDate: '2024-01-01', toDate: '2024-12-31' },
  yPeriod: { fromDate: '2024-01-01', toDate: '2024-12-31' },
  x,
  y,
});
const table = () => within(screen.getByRole('region', { name: 'Indicator comparison data table' }));

it.each([false, true])(
  'defaults to the page indicator on y and swaps axes and table values together: %s',
  (cached) => {
    const { container } = render(
      <CompareIndicatorsChart
        selected={indicators}
        selectedAreaCodes={['A']}
        scatter={cached ? { points: [point('A', 10, 20)] } : undefined}
      />,
    );
    const labels = () =>
      [...container.querySelectorAll('.fphd-chart-axis-title')].map((node) =>
        node.textContent?.replaceAll('\u00a0', ' '),
      );
    const headers = () =>
      table()
        .getAllByRole('columnheader')
        .map((node) => node.textContent);
    const values = () => {
      const row = table().getByRole('rowheader', { name: 'Area A' }).closest('tr');
      if (!row) throw new Error('Expected area row');
      return within(row)
        .getAllByRole('cell')
        .map((node) => node.textContent);
    };
    const initial = {
      labels: ['Prevalence (%)2024', 'Mortality (per 100,000)2024'],
      headers: ['Area', 'Mortality (2024)', 'Prevalence (2024)'],
      values: ['20.0 per 100,000', '10.0%'],
    };
    expect({ labels: labels(), headers: headers(), values: values() }).toEqual(initial);
    fireEvent.click(screen.getByRole('button', { name: 'Swap axis' }));
    expect({ labels: labels(), headers: headers(), values: values() }).toEqual({
      labels: [...initial.labels].reverse(),
      headers: ['Area', 'Prevalence (2024)', 'Mortality (2024)'],
      values: [...initial.values].reverse(),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Swap axis' }));
    expect({ labels: labels(), headers: headers(), values: values() }).toEqual(initial);
  },
);

it('names the highlighted area and population and uses the prototype markers', () => {
  const { container } = render(
    <CompareIndicatorsChart
      selected={indicators}
      selectedAreaCodes={['A']}
      scatter={{ points: [point('E92000001', 5, 6), point('A', 1, 3), point('B', 2, 2)] }}
    />,
  );
  expect(
    within(screen.getByRole('list', { name: 'Chart key' }))
      .getAllByRole('listitem')
      .map((item) => item.textContent),
  ).toEqual(['England', 'Area A', 'Upper tier local authorities (2)']);
  expect(container.querySelector('.recharts-scatter-symbol polygon')?.getAttribute('fill')).toBe(
    '#801650',
  );
  expect(
    container
      .querySelector('.recharts-scatter-symbol circle[fill="#12436d"]')
      ?.getAttribute('stroke'),
  ).toBe('#fff');
  expect(
    container
      .querySelector('.recharts-scatter-symbol circle[fill="#bfbfbf"]')
      ?.hasAttribute('stroke'),
  ).toBe(false);
});

it('reports negative Pearson correlation in the key and table, excluding England', () => {
  const { container } = render(
    <CompareIndicatorsChart
      selected={indicators}
      scatter={{
        points: [
          point('E92000001', 100, 100),
          point('A', 1, 3),
          point('B', 2, 2),
          point('C', 3, 1),
        ],
      }}
    />,
  );
  const checkbox = screen.getByRole('checkbox', {
    name: 'Show line of best fit and correlation (r)',
  });
  expect(screen.queryByRole('rowheader', { name: 'Correlation (r, estimated)' })).toBeNull();
  fireEvent.click(checkbox);
  expect(screen.getByRole('list', { name: 'Chart key' }).textContent).toContain('r = -1.00');
  expect(
    table().getByRole('rowheader', { name: 'Correlation (r, estimated)' }).closest('tr')
      ?.textContent,
  ).toContain('-1.00');
  const line = container.querySelector('.recharts-reference-line line');
  expect(line?.getAttribute('stroke')).toBe('#ca3535');
  expect(line?.getAttribute('stroke-width')).toBe('3');
  expect(line?.hasAttribute('stroke-dasharray')).toBe(false);
  fireEvent.click(checkbox);
  expect(screen.queryByRole('rowheader', { name: 'Correlation (r, estimated)' })).toBeNull();
  expect(container.querySelector('.recharts-reference-line')).toBeNull();
});

it('estimates weak correlations and filters the plotted population with England retained', () => {
  const scatter = {
    points: [
      point('E92000001', 5, 6),
      point('A', 1, 1),
      point('B', 2, 3),
      point('C', 3, 1),
      point('D', 4, 9),
    ],
  };
  const { container } = render(
    <CompareIndicatorsChart
      selected={indicators}
      scatter={scatter}
      selectedAreaCodes={['A']}
      only={new Set(['A', 'B', 'C'])}
      group="Statistical neighbours for Area A"
    />,
  );
  expect(container.querySelectorAll('.recharts-scatter-symbol')).toHaveLength(4);
  expect(screen.getByRole('list', { name: 'Chart key' }).textContent).toContain(
    'Statistical neighbours for Area A (3)',
  );
  fireEvent.click(screen.getByRole('checkbox', { name: /Show line of best fit/ }));
  expect(screen.getByRole('list', { name: 'Chart key' }).textContent).toContain('r = 0.00');
  expect(screen.queryByRole('rowheader', { name: 'Area D', hidden: true })).toBeNull();
});

it('labels only the applicable sex and changes values with the selected variant', () => {
  const scatter = {
    points: [],
    variants: ['Female', 'Male'].map((sex, index) => ({
      sex,
      axisSexes: [sex, ''],
      points: [point('A', index ? 9 : 8, 3)],
    })),
  };
  const { container, rerender } = render(
    <CompareIndicatorsChart
      selected={indicators}
      scatter={scatter}
      sex="Female"
      selectedAreaCodes={['A']}
    />,
  );
  expect(container.querySelector('.fphd-chart-axis-title')?.textContent).toBe(
    'Prevalence, female (%)2024',
  );
  expect(table().getByRole('rowheader', { name: 'Area A' }).closest('tr')?.textContent).toContain(
    '8.0%',
  );
  rerender(
    <CompareIndicatorsChart
      selected={indicators}
      scatter={scatter}
      sex="Male"
      selectedAreaCodes={['A']}
    />,
  );
  expect(container.querySelector('.fphd-chart-axis-title')?.textContent).toBe(
    'Prevalence, male (%)2024',
  );
  expect(table().getByRole('rowheader', { name: 'Area A' }).closest('tr')?.textContent).toContain(
    '9.0%',
  );
});

it('keeps financial and three-year periods with their axes and table columns when swapped', () => {
  const { container } = render(
    <CompareIndicatorsChart
      selected={indicators}
      scatter={{
        points: [
          {
            ...point('A', 10, 20),
            xPeriod: { fromDate: '2024-04-01', toDate: '2025-03-31' },
            yPeriod: { fromDate: '2022-01-01', toDate: '2024-12-31' },
          },
        ],
      }}
    />,
  );
  const labels = () =>
    [...container.querySelectorAll('.fphd-chart-axis-title')].map((node) =>
      node.textContent?.replaceAll('\u00a0', ' '),
    );
  const headers = () =>
    table()
      .getAllByRole('columnheader')
      .map((node) => node.textContent);
  expect(labels()).toEqual(['Prevalence (%)2024/25', 'Mortality (per 100,000)2022 to 2024']);
  expect(headers()).toEqual(['Area', 'Mortality (2022 to 2024)', 'Prevalence (2024/25)']);
  fireEvent.click(screen.getByRole('button', { name: 'Swap axis' }));
  expect(labels()).toEqual(['Mortality (per 100,000)2022 to 2024', 'Prevalence (%)2024/25']);
  expect(headers()).toEqual(['Area', 'Prevalence (2024/25)', 'Mortality (2022 to 2024)']);
});

it('names both periods in the chart title and gives a lagging value its own period', () => {
  const periods = {
    xPeriod: { fromDate: '2024-04-01', toDate: '2025-03-31' },
    yPeriod: { fromDate: '2022-01-01', toDate: '2024-12-31' },
  };
  const { container } = render(
    <CompareIndicatorsChart
      selected={indicators}
      selectedAreaCodes={['A']}
      scatter={{
        points: [
          { ...point('E92000001', 12, 22), ...periods },
          {
            ...point('A', 10, 20),
            ...periods,
            xPeriod: { fromDate: '2023-04-01', toDate: '2024-03-31' },
          },
          { ...point('B', 11, 21), ...periods },
        ],
      }}
    />,
  );
  expect(container.querySelector('[aria-label*="compared with"]')?.getAttribute('aria-label')).toBe(
    'Prevalence, 2024/25 compared with Mortality, 2022 to 2024',
  );
  const row = (name: string) =>
    within(table().getByRole('rowheader', { name }).closest('tr') as HTMLElement)
      .getAllByRole('cell')
      .map((node) => node.textContent);
  expect(row('England')).toEqual(['22.0 per 100,000', '12.0%']);
  expect(row('Area A')).toEqual(['20.0 per 100,000', '10.0% (2023/24)']);
  const all = within(screen.getByRole('region', { name: 'All areas in the indicator comparison' }));
  expect(all.getAllByRole('columnheader').map((node) => node.textContent)).toEqual([
    'Area',
    'Mortality (2022 to 2024)',
    'Prevalence (2024/25)',
  ]);
});

it('says when no area has values for both indicators', () => {
  render(<CompareIndicatorsChart selected={indicators} scatter={{ points: [] }} />);
  expect(screen.getByText('No areas have values for both indicators.')).toBeTruthy();
});
