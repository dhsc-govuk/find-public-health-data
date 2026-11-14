// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { indicatorDetail, observation, selected } from '../view.testing.ts';
import { CompareIndicatorsChart } from './scatter-chart.tsx';

afterEach(cleanup);

it.each([false, true])(
  'swaps axis titles and table values together with cached scatter data: %s',
  (cached) => {
    const indicators = [selected(108), selected(241)].map((entry, index) => ({
      ...entry,
      detail: indicatorDetail(entry.detail.shortId, {
        name: index === 0 ? 'Prevalence' : 'Mortality',
        unit: index === 0 ? '%' : 'per 100,000',
      }),
      areaData: [
        { areaCode: 'A', areaName: 'Area A', observations: [observation(index === 0 ? 10 : 20)] },
      ],
    }));
    const { container } = render(
      <CompareIndicatorsChart
        selected={indicators}
        scatter={
          cached
            ? {
                points: [
                  {
                    code: 'A',
                    name: 'Area A',
                    period: '2024-01-01|2024-12-31',
                    fromDate: '2024-01-01',
                    toDate: '2024-12-31',
                    x: 10,
                    y: 20,
                  },
                ],
              }
            : undefined
        }
      />,
    );
    const labels = () =>
      [...container.querySelectorAll('.fphd-chart-axis-title')].map((node) => node.textContent);
    const headers = () =>
      screen.getAllByRole('columnheader', { hidden: true }).map((node) => node.textContent);
    const values = () =>
      within(screen.getByRole('table', { hidden: true }))
        .getAllByRole('cell', { hidden: true })
        .map((node) => node.textContent);
    const initial = {
      labels: ['Mortality (per 100,000)', 'Prevalence (%)'],
      headers: ['Area', 'Prevalence (%)', 'Mortality (per 100,000)'],
      values: ['10.0%', '20.0 per 100,000'],
    };
    expect({ labels: labels(), headers: headers(), values: values() }).toEqual(initial);
    fireEvent.click(screen.getByRole('button', { name: 'Swap axes' }));
    expect({ labels: labels(), headers: headers(), values: values() }).toEqual({
      labels: [...initial.labels].reverse(),
      headers: ['Area', 'Mortality (per 100,000)', 'Prevalence (%)'],
      values: [...initial.values].reverse(),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Swap axes' }));
    expect({ labels: labels(), headers: headers(), values: values() }).toEqual(initial);
  },
);
