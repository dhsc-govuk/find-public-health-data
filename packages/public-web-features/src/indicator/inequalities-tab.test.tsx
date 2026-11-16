// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMemoryRouter, createRoutesStub, RouterProvider } from 'react-router';
import { afterEach, expect, it } from 'vitest';
import { benchmarkJudgement } from './data.ts';
import { inequalityTableModel } from './inequalities.ts';
import { InequalitiesTab } from './inequalities-tab.tsx';
import { deprivation, observation, selected, sex } from './view.testing.ts';

afterEach(cleanup);

it('renders the inequalities values on the server without the interactive canvas', () => {
  const primary = selected();
  primary.detail.numeratorSources = [];
  const router = createMemoryRouter([
    { path: '/', element: <InequalitiesTab primary={primary} /> },
  ]);
  const html = renderToStaticMarkup(<RouterProvider router={router} />);
  const document = new DOMParser().parseFromString(html, 'text/html');
  const table = document.querySelector('table');
  expect(table?.textContent).toContain('Better than England');
  expect(table?.textContent).toContain('32.0');
  expect(table?.querySelectorAll('tbody tr').length).toBeGreaterThan(0);
  expect(document.querySelector('.recharts-wrapper')).toBeNull();
  router.dispose();
});

it.each([
  ['', 'Similar to England', '#ffc000'],
  ['?ci-108=95', 'Better than England', '#8ed973'],
])(
  'keeps chart and table judgements aligned for confidence selection %s',
  (search, label, colour) => {
    const primary = selected();
    primary.detail.numeratorSources = [];
    primary.areaData = primary.areaData.map((area) =>
      area.areaCode === 'E06000052'
        ? {
            ...area,
            observations: [
              observation(30, [sex('Female')]),
              observation(21.5, [sex('Female'), deprivation]),
            ],
          }
        : area,
    );
    const model = inequalityTableModel(primary, new URLSearchParams(search));
    expect(
      benchmarkJudgement(model.rows[0], model.benchmark?.value ?? null, primary.detail, '95'),
    ).toBe('better');
    expect(
      benchmarkJudgement(model.rows[0], model.benchmark?.value ?? null, primary.detail, '99.8'),
    ).toBe('similar');
    if (!search) expect(model.confidence).toBe('none');
    const Routes = createRoutesStub([
      { path: '/', Component: () => <InequalitiesTab primary={primary} /> },
    ]);
    render(<Routes initialEntries={[`/${search}`]} />);
    const chart = screen.getByRole('region', { name: /^Inequalities:/ });
    const key = within(chart).getByRole('list', { name: 'Comparison key' });
    expect(within(key).getByText(label)).toBeTruthy();
    expect(key.querySelector('rect')?.getAttribute('fill')).toBe(colour);
    const table = screen.getByRole('table');
    expect(within(table).getByText(label)).toBeTruthy();
  },
);
