// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createRoutesStub, useLocation } from 'react-router';
import { afterEach, expect, it } from 'vitest';
import { benchmarkFixture } from './benchmark.testing.ts';
import { IndicatorTab } from './indicator-tab.tsx';
import { publishedSexFixture } from './published-sex.testing.ts';
import { indicatorDetail, observation, sex } from './view.testing.ts';

afterEach(cleanup);

it.each([92443, 93622] as const)(
  'matches Fingertips persons-only choices for %s with a stale sex and unpublished age',
  (shortId) => {
    const Routes = noEnglandRoutes({
      primary: publishedSexFixture(shortId),
      selection: { areaCodes: [], areaLevels: [], shortIds: [shortId] },
    });
    render(<Routes initialEntries={[`/?sex-${shortId}=Male&age-${shortId}=65%2B+yrs`]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Table columns' }));
    expect(screen.queryByLabelText('Select sex')).toBeNull();
    const ages = screen.queryAllByLabelText<HTMLSelectElement>('Select age');
    if (shortId === 92443) expect(ages).toHaveLength(0);
    else {
      expect(ages.length).toBeGreaterThan(0);
      for (const select of ages)
        expect([...select.options].map(({ value }) => value)).toEqual(['All ages', '<18 yrs']);
    }
    const chart = document.querySelector('#indicator-trend-chart')?.textContent;
    expect(chart).toContain('12.0%');
    for (const value of ['77.0%', '88.0%', '99.0%']) expect(chart).not.toContain(value);
    const download = screen.getByRole('link', {
      name: "Download data for the areas you've chosen (CSV)",
    });
    const params = new URL(download.getAttribute('href') ?? '', 'http://localhost').searchParams;
    expect(params.has(`sex-${shortId}`)).toBe(false);
    expect(params.get(`age-${shortId}`)).toBe(shortId === 92443 ? '18+ yrs' : 'All ages');
  },
);

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
  // A remove link is removed along with its chip, so its fragment moves focus to what is still
  // shown.
  const showing = screen.getByRole('group', { name: 'Showing:' });
  expect(showing.id).toBe('indicator-data-showing');
  expect(showing.getAttribute('tabindex')).toBe('-1');
  for (const link of screen.getAllByRole('link', { name: /^Remove .* filter$/ }))
    expect(link.getAttribute('href')).toMatch(/#indicator-data-showing$/);
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
    [...(geography?.querySelectorAll('.fphd-filter-card__toggle') ?? [])].map((toggle) =>
      toggle.getAttribute('aria-label'),
    ),
  ).toEqual(['Geographies', 'Benchmarks']);
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

it.each([{ observations: [] }, { observations: [{ ...observation(), value: null }] }])(
  'says the indicator has no England-level figure when England has no values in %j',
  ({ observations }) => {
    const Routes = noEnglandRoutes({
      primary: {
        detail: indicatorDetail(),
        areaData: [{ areaCode: 'E92000001', areaName: 'England', observations }],
      },
    });
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
  },
);

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

it('shows no England figure when only another period type has England values', () => {
  const Routes = noEnglandRoutes({
    primary: {
      detail: indicatorDetail(),
      areaData: [
        {
          areaCode: 'E92000001',
          areaName: 'England',
          observations: [
            observation(10),
            { ...observation(), fromDate: '2022-01-01', value: null },
          ],
        },
      ],
    },
  });
  render(<Routes initialEntries={['/?pt-108=3-year']} />);
  expect(
    screen.getByText('This indicator has no England-level figure. Choose areas to see data.'),
  ).toBeTruthy();
  expect(screen.queryByRole('table')).toBeNull();
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

it('offers just the two published ages for 90799, switches chart and table, and preserves the age URL', async () => {
  const age = (years: number) => ({
    type: 'Age',
    value: `${years}+ yrs`,
    ageFrom: `P${years}Y`,
    dimensionClass: 'core' as const,
    sortOrder: years,
  });
  const detail = indicatorDetail(90799, {
    publishedGroupings: [18, 65].map((years) => ({
      sex: null,
      age: `${years}+ yrs`,
      yearRange: 1,
      periodKind: 'annual' as const,
    })),
  });
  const Routes = createRoutesStub([
    {
      path: '/',
      Component: () => (
        <>
          <IndicatorTab
            primary={{
              detail,
              areaData: [
                {
                  areaCode: 'E92000001',
                  areaName: 'England',
                  observations: [18, 65, 75, 85, 90, 95].map((years) => ({
                    ...observation(years, [age(years)]),
                    lowerCi95: null,
                    upperCi95: null,
                    lowerCi998: null,
                    upperCi998: null,
                  })),
                },
              ],
            }}
            selectedAreas={[]}
            benchmarkGeography={{ regionByCode: {}, levelByCode: {} }}
            displayGroups={[]}
            selection={{ areaCodes: [], areaLevels: [], shortIds: [90799] }}
          />
          <output data-testid="location">{useLocation().search}</output>
        </>
      ),
    },
  ]);
  render(<Routes initialEntries={['/?age-90799=75%2B+yrs']} />);
  fireEvent.click(screen.getByRole('button', { name: 'Table columns' }));
  const selects = screen.getAllByLabelText('Select age') as HTMLSelectElement[];
  expect(selects).toHaveLength(2);
  for (const select of selects) {
    expect([...select.options].map(({ value }) => value)).toEqual(['18+ yrs', '65+ yrs']);
    expect(select.value).toBe('18+ yrs');
  }
  const select = selects[0];
  if (!select) throw new Error('Age select missing');
  fireEvent.change(select, { target: { value: '65+ yrs' } });
  await waitFor(() =>
    expect(screen.getByTestId('location').textContent).toContain('age-90799=65%2B+yrs'),
  );
  expect(screen.getByRole('table', { name: /^Table:.*65\+ yrs/ })).toBeTruthy();
  expect(document.querySelector('#indicator-trend-chart')?.textContent).toContain('65.0%');
  for (const select of selects) expect(select.value).toBe('65+ yrs');
  const form = select.closest('form');
  if (!form) throw new Error('Age form missing');
  expect(new FormData(form).get('age-90799')).toBe('65+ yrs');
});

function ageDimension(years: number) {
  return {
    type: 'Age',
    value: `${years}+ yrs`,
    ageFrom: `P${years}Y`,
    dimensionClass: 'core' as const,
    sortOrder: years,
  };
}

const publishedGroupings = [18, 65].map((years) => ({
  sex: null,
  age: `${years}+ yrs`,
  yearRange: 1,
  periodKind: 'annual' as const,
}));

it('chooses the selected areas age when England has only suppressed values', () => {
  const Routes = noEnglandRoutes({
    primary: {
      detail: indicatorDetail(108, { publishedGroupings }),
      areaData: [
        {
          areaCode: 'E12000001',
          areaName: 'North East',
          observations: [observation(65, [ageDimension(65)])],
        },
        {
          areaCode: 'E92000001',
          areaName: 'England',
          observations: [{ ...observation(18, [ageDimension(18)]), value: null }],
        },
      ],
    },
    selection: { areaCodes: ['E12000001'], areaLevels: [], shortIds: [108] },
  });
  render(<Routes initialEntries={['/?as=E12000001']} />);
  fireEvent.click(screen.getByRole('button', { name: 'Table columns' }));
  for (const select of screen.getAllByLabelText<HTMLSelectElement>('Select age'))
    expect(select.value).toBe('65+ yrs');
  expect(screen.getByRole('table', { name: /^Table:.*65\+ yrs/ })).toBeTruthy();
  expect(document.querySelector('#indicator-trend-chart')?.textContent).toContain('65.0%');
  const download = screen.getByRole('link', {
    name: "Download data for the areas you've chosen (CSV)",
  });
  expect(
    new URL(download.getAttribute('href') ?? '', 'http://localhost').searchParams.get('age-108'),
  ).toBe('65+ yrs');
});

it.each(['18+ yrs', '75+ yrs'])(
  'writes the resolved age after changing sex with requested age %s',
  async (requestedAge) => {
    const Routes = createRoutesStub([
      {
        path: '/',
        Component: () => (
          <>
            <IndicatorTab
              primary={{
                detail: indicatorDetail(108, {
                  publishedGroupings: [
                    ...publishedGroupings.map((grouping) => ({ ...grouping, sex: 'Female' })),
                    { sex: 'Male', age: '65+ yrs', yearRange: 1, periodKind: 'annual' },
                  ],
                }),
                areaData: [
                  {
                    areaCode: 'E92000001',
                    areaName: 'England',
                    observations: [
                      observation(18, [sex('Female'), ageDimension(18)]),
                      observation(65, [sex('Female'), ageDimension(65)]),
                      observation(66, [sex('Male'), ageDimension(65)]),
                    ],
                  },
                ],
              }}
              selectedAreas={[]}
              benchmarkGeography={{ regionByCode: {}, levelByCode: {} }}
              displayGroups={[]}
              selection={{ areaCodes: [], areaLevels: [], shortIds: [108] }}
            />
            <output data-testid="location">{useLocation().search}</output>
          </>
        ),
      },
    ]);
    render(
      <Routes initialEntries={[`/?sex-108=Female&age-108=${encodeURIComponent(requestedAge)}`]} />,
    );
    fireEvent.change(screen.getByLabelText('Select confidence intervals'), {
      target: { value: '95' },
    });
    const params = () => new URLSearchParams(screen.getByTestId('location').textContent ?? '');
    await waitFor(() => expect(params().get('age-108')).toBe('18+ yrs'));
    fireEvent.change(screen.getByRole('combobox', { name: 'Select sex' }), {
      target: { value: 'Male' },
    });
    await waitFor(() => expect(params().get('age-108')).toBe('65+ yrs'));
    expect(params().get('sex-108')).toBe('Male');
    expect(params().get('ci-108')).toBe('95');
    expect(screen.getByRole('table', { name: /^Table:.*65\+ yrs/ })).toBeTruthy();
    expect(document.querySelector('#indicator-trend-chart')?.textContent).toContain('66.0%');
  },
);

it('hides the age control for one published age', () => {
  const detail = indicatorDetail(108, {
    publishedGroupings: [{ sex: null, age: '18+ yrs', yearRange: 1, periodKind: 'annual' }],
  });
  const Routes = createRoutesStub([
    {
      path: '/',
      Component: () => (
        <IndicatorTab
          primary={{ detail, areaData: [] }}
          selectedAreas={[]}
          benchmarkGeography={{ regionByCode: {}, levelByCode: {} }}
          displayGroups={[]}
          selection={{ areaCodes: [], areaLevels: [], shortIds: [108] }}
        />
      ),
    },
  ]);
  render(<Routes />);
  expect(screen.queryByLabelText('Select age')).toBeNull();
});
