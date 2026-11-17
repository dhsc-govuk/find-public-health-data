// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRoutesStub, useLocation } from 'react-router';
import { afterEach, expect, it } from 'vitest';
import { benchmarkFixture } from './benchmark.testing.ts';
import { IndicatorTab } from './indicator-tab.tsx';
import { indicatorDetail, observation } from './view.testing.ts';

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
