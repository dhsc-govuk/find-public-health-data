// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createRoutesStub, useLocation } from 'react-router';
import { afterEach, expect, it } from 'vitest';
import { benchmarkFixture } from './benchmark.testing.ts';
import { IndicatorTab } from './indicator-tab.tsx';
import { indicatorDetail, observation, sex } from './view.testing.ts';

afterEach(cleanup);

it('offers no-area goal radios with a working GET form, default No, and toggles England verdicts', async () => {
  const fixture = benchmarkFixture();
  const Routes = createRoutesStub([
    {
      path: '/',
      Component: () => {
        const location = useLocation();
        return (
          <>
            <IndicatorTab
              primary={{
                detail: fixture.detail,
                areaData: fixture.areaData.filter(({ areaCode }) => areaCode === 'E92000001'),
              }}
              selectedAreas={[]}
              benchmarkGeography={{ regionByCode: {}, levelByCode: {} }}
              displayGroups={[]}
              selection={{ areaCodes: [], areaLevels: [], shortIds: [108] }}
            />
            <output data-testid="location">{location.search}</output>
          </>
        );
      },
    },
  ]);
  render(<Routes initialEntries={['/?sex-108=Female']} />);
  fireEvent.click(screen.getByRole('button', { name: 'Table columns' }));
  const yes = screen.getByRole('radio', { name: 'Yes' }) as HTMLInputElement;
  const no = screen.getByRole('radio', { name: 'No' }) as HTMLInputElement;
  expect(no.checked).toBe(true);
  expect(yes.checked).toBe(false);
  expect(yes.closest('fieldset')?.querySelector('legend')?.className).toBe(
    'govuk-fieldset__legend govuk-fieldset__legend--s',
  );
  expect(yes.closest('.govuk-radios--inline.govuk-radios--small')).toBeTruthy();
  expect(screen.queryByRole('checkbox', { name: 'Compared with policy goal' })).toBeNull();
  const form = yes.closest('form');
  if (!form) throw new Error('Goal form missing');
  expect(new FormData(form).getAll('cmp-108')).toEqual(['']);
  fireEvent.click(yes);
  await waitFor(() =>
    expect(
      new URLSearchParams(screen.getByTestId('location').textContent ?? '').getAll('cmp-108'),
    ).toEqual(['goal']),
  );
  expect(new FormData(form).getAll('cmp-108')).toEqual(['goal']);
  expect(new FormData(form).get('sex-108')).toBe('Female');
  expect(
    (screen.getByRole('checkbox', { name: 'Compared with policy goal' }) as HTMLInputElement)
      .checked,
  ).toBe(true);
  expect(screen.getByRole('columnheader', { name: 'Compared with policy goal' })).toBeTruthy();
  expect(screen.getByText('Policy goals')).toBeTruthy();
  fireEvent.click(no);
  await waitFor(() =>
    expect(screen.queryByRole('columnheader', { name: 'Compared with policy goal' })).toBeNull(),
  );
  expect(new FormData(form).getAll('cmp-108')).toEqual(['']);
});

it('uses every new checkbox label for its showing chip', () => {
  const fixture = benchmarkFixture();
  const Routes = createRoutesStub([
    {
      path: '/',
      Component: () => (
        <IndicatorTab
          primary={fixture}
          selectedAreas={[]}
          benchmarkGeography={fixture.geography}
          displayGroups={[]}
          selection={{ areaCodes: [], areaLevels: [], shortIds: [108] }}
        />
      ),
    },
  ]);
  render(
    <Routes
      initialEntries={[
        `/?${new URLSearchParams(fixture.benchmarks.map((choice) => ['cmp-108', choice]))}`,
      ]}
    />,
  );
  for (const label of [
    'Areas with similar deprivation to the selected area (Index of Multiple Deprivation (IMD) 2025)',
    'Areas with similar deprivation to the selected area (Index of Multiple Deprivation (IMD) 2019)',
    'Statistical neighbours (Manchester)',
    'Combined authority (Manchester)',
    'Policy goal',
  ])
    expect(screen.getByRole('link', { name: `Remove ${label} filter` })).toBeTruthy();
  const chips = [
    ...document.querySelectorAll('.fphd-indicator-showing .fphd-filter-chip span'),
  ].map((chip) => chip.textContent);
  expect(chips.indexOf('Policy goal')).toBeLessThan(
    chips.indexOf('Statistical neighbours (Manchester)'),
  );
  expect(chips.indexOf('Statistical neighbours (Manchester)')).toBeLessThan(
    chips.indexOf('Combined authority (Manchester)'),
  );
});

it('shows area chips before removable benchmark chips and keeps the other choices when removing one', async () => {
  const Routes = createRoutesStub([
    {
      path: '/',
      Component: () => {
        const location = useLocation();
        return (
          <>
            <IndicatorTab
              primary={{
                detail: indicatorDetail(),
                areaData: [
                  {
                    areaCode: 'E10000032',
                    areaName: 'West Sussex',
                    observations: [observation(8)],
                  },
                  { areaCode: 'E92000001', areaName: 'England', observations: [observation(7.9)] },
                ],
                regionData: [
                  {
                    areaCode: 'E12000008',
                    areaName: 'South East',
                    observations: [observation(7.3)],
                  },
                ],
              }}
              selectedAreas={[
                { code: 'E10000032', name: 'West Sussex', level: 'Local authorities' },
              ]}
              benchmarkGeography={{
                regionByCode: { E10000032: { code: 'E12000008', name: 'South East' } },
                levelByCode: { E10000032: 'Local authorities' },
              }}
              displayGroups={[]}
              selection={{ areaCodes: ['E10000032'], areaLevels: [], shortIds: [108] }}
            />
            <output data-testid="location">{location.search}</output>
          </>
        );
      },
    },
  ]);
  const { container } = render(
    <Routes initialEntries={['/?as=E10000032&cmp-108=region&cmp-108=england&ci-108=95']} />,
  );
  expect(
    [...container.querySelectorAll('.fphd-indicator-showing .fphd-filter-chip span')].map(
      (chip) => chip.textContent,
    ),
  ).toEqual(['West Sussex', 'England', 'Statistical regions']);
  const geography = container.querySelector('.fphd-indicator-geographies');
  expect(
    [...(geography?.querySelectorAll('h3') ?? [])].map((heading) => heading.textContent),
  ).toEqual(['GeographiesGeographies', 'BenchmarksBenchmarks']);
  const params = () => new URLSearchParams(screen.getByTestId('location').textContent ?? '');
  fireEvent.click(screen.getByRole('link', { name: 'Remove England filter' }));
  await waitFor(() => expect(params().getAll('cmp-108')).toEqual(['region']));
  expect((screen.getByRole('checkbox', { name: 'England' }) as HTMLInputElement).checked).toBe(
    false,
  );
  expect(params().get('as')).toBe('E10000032');
  expect(params().get('ci-108')).toBe('95');
  fireEvent.click(screen.getByRole('link', { name: 'Remove Statistical regions filter' }));
  await waitFor(() => expect(params().getAll('cmp-108')).toEqual(['']));
  expect(screen.queryByRole('link', { name: 'Remove England filter' })).toBeNull();
});

function noEnglandRoutes(props: Partial<Parameters<typeof IndicatorTab>[0]>) {
  const fixture = benchmarkFixture();
  return createRoutesStub([
    {
      path: '/',
      Component: () => (
        <IndicatorTab
          primary={{
            detail: fixture.detail,
            areaData: [{ areaCode: 'E92000001', areaName: 'England', observations: [] }],
          }}
          selectedAreas={[]}
          benchmarkGeography={{ regionByCode: {}, levelByCode: {} }}
          displayGroups={[]}
          selection={{ areaCodes: [], areaLevels: [], shortIds: [108] }}
          {...props}
        />
      ),
    },
  ]);
}

it('says the indicator has no England-level figure, without the chosen-areas download, when nothing is shown', () => {
  const Routes = noEnglandRoutes({});
  const { container } = render(<Routes initialEntries={['/']} />);

  expect(
    screen.getByText('This indicator has no England-level figure. Choose areas to see data.'),
  ).toBeTruthy();
  expect(screen.queryByRole('table')).toBeNull();
  expect(
    screen.queryByRole('link', { name: "Download data for the areas you've chosen (CSV)" }),
  ).toBeNull();
  expect(screen.getByRole('link', { name: 'Download data for all areas (CSV)' })).toBeTruthy();
  expect(container.querySelector('input[type="hidden"][name="cmp-108"]')).toBeNull();
});

it('shows the default level of an indicator with no England value, without an England benchmark', () => {
  const fixture = benchmarkFixture();
  const Routes = noEnglandRoutes({
    primary: {
      detail: fixture.detail,
      areaData: [
        fixture.area('E12000001', 'North East', 4),
        {
          areaCode: 'E12000002',
          areaName: 'North West',
          observations: [observation(5, [sex('Male')])],
        },
        { areaCode: 'E92000001', areaName: 'England', observations: [] },
      ],
    },
    defaultAreaLevel: 'Statistical regions',
  });
  render(<Routes initialEntries={['/']} />);

  const showing = screen.getByText('Showing:').parentElement;
  expect(showing?.textContent).toContain('Statistical regions');
  expect(showing?.textContent).not.toContain('England');
  expect(screen.queryByRole('link', { name: /Remove Statistical regions/ })).toBeNull();
  expect(screen.getAllByRole('columnheader', { name: 'North East' })).toBeTruthy();
  expect(screen.queryByRole('checkbox', { name: 'England' })).toBeNull();
  expect(
    [...(screen.getAllByLabelText('Select sex')[0] as HTMLSelectElement).options].map(
      ({ value }) => value,
    ),
  ).toEqual(['', 'Female', 'Male']);
  const download = screen.getByRole('link', {
    name: "Download data for the areas you've chosen (CSV)",
  });
  expect(
    new URL(download.getAttribute('href') ?? '', 'http://localhost').searchParams.getAll('as'),
  ).toEqual(['E12000001', 'E12000002']);
});

it("offers England's sexes when England has a value, whatever the picked area has", () => {
  const fixture = benchmarkFixture();
  const Routes = noEnglandRoutes({
    primary: {
      detail: fixture.detail,
      areaData: [
        { areaCode: 'E06000052', areaName: 'Cornwall', observations: [observation(9)] },
        {
          areaCode: 'E92000001',
          areaName: 'England',
          observations: [observation(5, [sex('Male')])],
        },
      ],
    },
    selection: { areaCodes: ['E06000052'], areaLevels: [], shortIds: [108] },
  });
  render(<Routes initialEntries={['/']} />);

  expect(
    [...(screen.getAllByLabelText('Select sex')[0] as HTMLSelectElement).options].map(
      ({ value }) => value,
    ),
  ).toEqual(['', 'Male']);
});

it('offers no empty period select when the picked area has no data', () => {
  const fixture = benchmarkFixture();
  const Routes = noEnglandRoutes({
    primary: {
      detail: fixture.detail,
      areaData: [
        { areaCode: 'E06000052', areaName: 'Cornwall', observations: [] },
        {
          areaCode: 'E92000001',
          areaName: 'England',
          observations: [observation(5), { ...observation(6), fromDate: '2022-01-01' }],
        },
      ],
    },
    selection: { areaCodes: ['E06000052'], areaLevels: [], shortIds: [108] },
  });
  render(<Routes initialEntries={['/']} />);

  for (const select of screen.getAllByLabelText<HTMLSelectElement>('Type of time period')) {
    expect([...select.options].map(({ text }) => text)).toEqual([
      '1 year',
      '3 year rolling average',
    ]);
    expect(select.value).toBe('1-year');
  }
});

it('offers only the sexes of the period type shown', () => {
  const fixture = benchmarkFixture();
  const Routes = noEnglandRoutes({
    primary: {
      detail: fixture.detail,
      areaData: [
        {
          areaCode: 'E92000001',
          areaName: 'England',
          observations: [
            observation(5),
            { ...observation(6, [sex('Male')]), fromDate: '2022-01-01' },
          ],
        },
      ],
    },
  });
  render(<Routes initialEntries={['/?sex-108=Male']} />);

  expect(screen.queryByLabelText('Select sex')).toBeNull();
  expect(
    within(screen.getByRole('table', { name: /^Table:/ })).getByRole('rowheader', { name: '2024' }),
  ).toBeTruthy();
});

it("says the areas shown lack a period type when they are the page's default level", () => {
  const fixture = benchmarkFixture();
  const rolling = (value: number) => ({ ...observation(value), fromDate: '2022-01-01' });
  const Routes = noEnglandRoutes({
    primary: {
      detail: fixture.detail,
      areaData: [
        {
          areaCode: 'E12000001',
          areaName: 'North East',
          observations: [observation(4), rolling(5)],
        },
        { areaCode: 'E12000002', areaName: 'North West', observations: [rolling(6)] },
        { areaCode: 'E92000001', areaName: 'England', observations: [] },
      ],
    },
    defaultAreaLevel: 'Statistical regions',
  });
  render(<Routes initialEntries={['/']} />);

  expect(
    screen
      .getAllByRole('status')
      .some(
        ({ textContent }) =>
          textContent ===
          'Showing 3 year rolling averages because some of the areas shown have no 1 year data.',
      ),
  ).toBe(true);
});

it('offers only the table columns and intervals the period type shown publishes', () => {
  const fixture = benchmarkFixture();
  const Routes = noEnglandRoutes({
    primary: {
      detail: fixture.detail,
      areaData: [
        {
          areaCode: 'E92000001',
          areaName: 'England',
          observations: [
            {
              ...observation(5),
              count: null,
              lowerCi95: null,
              upperCi95: null,
              lowerCi998: null,
              upperCi998: null,
            },
            { ...observation(6), fromDate: '2022-01-01' },
          ],
        },
      ],
    },
  });
  const { container } = render(<Routes initialEntries={['/?columns-108=count,value,95']} />);

  expect(container.querySelector('input[name="columns-108"][value="count"]')).toBeNull();
  expect(container.querySelector('input[name="columns-108"][value="95"]')).toBeNull();
  expect(screen.queryByLabelText('Select confidence intervals')).toBeNull();
  expect(screen.queryByRole('columnheader', { name: /Count/ })).toBeNull();
});
