// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRoutesStub, useLocation } from 'react-router';
import { afterEach, expect, it } from 'vitest';
import { IndicatorTab } from './indicator-tab.tsx';
import { indicatorDetail, observation } from './view.testing.ts';

afterEach(cleanup);

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
