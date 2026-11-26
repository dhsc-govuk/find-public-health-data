// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMemoryRouter, createRoutesStub, RouterProvider } from 'react-router';
import { afterEach, expect, it } from 'vitest';
import { benchmarkJudgement } from './data.ts';
import { sexedInequalities } from './inequalities.testing.ts';
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

it("names the data values' sources under the table of an indicator with no numerator", () => {
  const primary = selected();
  primary.detail.numeratorSources = [];
  primary.detail.dataValues = [
    {
      sources: [{ provider: 'NHS England (NHSE)', source: 'Hospital Episode Statistics (HES)' }],
      definition: 'Admissions',
      disclosureControl: null,
    },
  ];
  const router = createMemoryRouter([
    { path: '/', element: <InequalitiesTab primary={primary} /> },
  ]);
  const html = renderToStaticMarkup(<RouterProvider router={router} />);

  expect(html).toContain('Source: NHS England (NHSE): Hospital Episode Statistics (HES)');
  router.dispose();
});

it.each([
  ['', 'Similar to England'],
  ['?ci-108=95', 'Better than England'],
])('uses the same England judgement in the chart and table %s', (search, label) => {
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
  expect(key.querySelector('rect')?.getAttribute('fill')).toBe(search ? '#8ed973' : '#ffc000');
  const table = screen.getByRole('table');
  expect(within(table).getByText(label)).toBeTruthy();
});

it('says the indicator has no England-level figure when nothing else is shown', () => {
  const primary = selected();
  primary.areaData = [{ areaCode: 'E92000001', areaName: 'England', observations: [] }];
  const Routes = createRoutesStub([
    { path: '/', Component: () => <InequalitiesTab primary={primary} /> },
  ]);
  render(<Routes initialEntries={['/']} />);

  expect(
    screen.getByText('This indicator has no England-level figure. Choose areas to see data.'),
  ).toBeTruthy();
  expect(
    screen.queryByText('This indicator has no inequality breakdowns for the selected areas.'),
  ).toBeNull();
  expect(screen.queryByRole('combobox', { name: 'Geography' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Apply geography' })).toBeNull();
});

it.each([
  ['Female', 20, 22, ['2024', '2023']],
  ['Male', 40, 42, ['2024', '2022']],
] as const)(
  'renders %s inequalities, England and options from the shared URL selection',
  (sexValue, benchmark, white, periods) => {
    const Routes = createRoutesStub([
      { path: '/', Component: () => <InequalitiesTab primary={sexedInequalities()} /> },
    ]);
    render(<Routes initialEntries={[`/?sex-90632=${sexValue}&ic-90632=Ethnic+groups`]} />);
    const table = screen.getByRole('table');
    expect(table.querySelector('caption')?.textContent).toContain(`Indicator 90632, ${sexValue}`);
    const chart = screen.getByRole('region', { name: /^Inequalities:/ });
    expect(within(chart).getByRole('heading').textContent).toContain(`England, ${sexValue}`);
    const englandRow = within(table).getByRole('rowheader', { name: 'England' }).closest('tr');
    expect(englandRow?.children[1]?.textContent).toBe((benchmark * 100).toLocaleString('en-GB'));
    expect(englandRow?.children[2]?.textContent).toBe(`${benchmark}.0%`);
    const whiteRow = within(table).getByRole('rowheader', { name: 'White' }).closest('tr');
    expect(whiteRow?.children[2]?.textContent).toBe(`${white}.0%`);
    expect(screen.queryByRole('radio', { name: 'Disability' }) !== null).toBe(
      sexValue === 'Female',
    );
    const periodSelect = screen.getByRole('combobox', { name: 'Time period' });
    expect(
      within(periodSelect)
        .getAllByRole('option')
        .map(({ textContent }) => textContent),
    ).toEqual(periods);
    for (const select of [periodSelect, screen.getByRole('combobox', { name: 'Geography' })]) {
      const form = select.closest('form');
      if (!form) throw new Error('Missing inequalities options form');
      expect(new FormData(form).get('sex-90632')).toBe(sexValue);
    }
    const href = screen
      .getByRole('link', { name: "Download data for the areas you've chosen (CSV)" })
      .getAttribute('href');
    expect(new URL(href ?? '', 'http://localhost').searchParams.get('sex-90632')).toBe(sexValue);
    expect(screen.queryByRole('combobox', { name: 'Select sex' })).toBeNull();
  },
);

it('uses the empty inequality state when a valid Male selection has no breakdown', () => {
  const primary = selected();
  primary.detail.numeratorSources = [];
  const Routes = createRoutesStub([
    { path: '/', Component: () => <InequalitiesTab primary={primary} /> },
  ]);
  render(<Routes initialEntries={['/?sex-108=Male']} />);
  expect(
    screen.getByText('This indicator has no inequality breakdowns for the selected areas and sex.'),
  ).toBeTruthy();
  expect(screen.queryByRole('table')).toBeNull();
  expect(screen.queryByRole('region', { name: /^Inequalities:/ })).toBeNull();
  expect(
    screen.queryByRole('link', { name: "Download data for the areas you've chosen (CSV)" }),
  ).toBeNull();
  expect(screen.queryByRole('combobox', { name: 'Time period' })).toBeNull();
});

it('shows the default Persons view without a stale sex label or empty state', () => {
  const Routes = createRoutesStub([
    { path: '/', Component: () => <InequalitiesTab primary={sexedInequalities()} /> },
  ]);
  render(<Routes initialEntries={['/?sex-90632=Unpublished&ic-90632=Ethnic+groups']} />);
  const table = screen.getByRole('table');
  expect(table.querySelector('caption')?.textContent).toBe(
    'Table of inequalities: Indicator 90632, Ethnic groups, England, 2024',
  );
  const white = within(table).getByRole('rowheader', { name: 'White' }).closest('tr');
  expect(white?.textContent).toContain('52.0%');
  expect(
    within(table).getByRole('rowheader', { name: 'England' }).closest('tr')?.textContent,
  ).toContain('50.0%');
  const chart = screen.getByRole('region', { name: /^Inequalities:/ });
  expect(within(chart).getByRole('heading').textContent).toBe(
    'Chart of inequalities: Indicator 90632, England',
  );
  expect(screen.queryByText(/no inequality breakdowns/)).toBeNull();
  expect(screen.queryByText(/Unpublished/)).toBeNull();
});
