// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRoutesStub, useLocation, useNavigate, useNavigation } from 'react-router';
import { afterEach, expect, it } from 'vitest';
import { IndicatorGeographies } from './geographies.tsx';

afterEach(cleanup);

it.each([
  ['', [], ['england']],
  ['?cmp-108=', [], ['']],
  ['?cmp-108=none', [], ['none']],
  ['?cmp-108=region&cmp-108=england', [], ['region', 'england']],
  ['?as=E08000003', ['E08000003'], []],
] as const)('preserves the no-JavaScript benchmark choice for %s', (search, codes, expected) => {
  const Routes = createRoutesStub([
    {
      path: '/',
      Component: () => (
        <IndicatorGeographies
          shortId={108}
          displayGroups={[]}
          selection={{ areaCodes: [...codes], areaLevels: [], shortIds: [108] }}
        />
      ),
    },
  ]);
  const { container } = render(<Routes initialEntries={[`/${search}`]} />);
  const form = container.querySelector('form');
  if (!form) throw new Error('Geography form missing');
  expect(new FormData(form).getAll('cmp-108')).toEqual(expected);
});

it('ticks no England benchmark for an indicator without an England value', () => {
  const Routes = createRoutesStub([
    {
      path: '/',
      Component: () => (
        <IndicatorGeographies
          shortId={108}
          displayGroups={[]}
          selection={{ areaCodes: [], areaLevels: [], shortIds: [108] }}
          englandBenchmark={false}
        />
      ),
    },
  ]);
  const { container } = render(<Routes initialEntries={['/']} />);
  const form = container.querySelector('form');
  if (!form) throw new Error('Geography form missing');
  expect(new FormData(form).getAll('cmp-108')).toEqual([]);
});

it('preserves a pending unchecked benchmark when clearing geographies', async () => {
  const pending = Promise.withResolvers<null>();
  const Routes = createRoutesStub([
    {
      path: '/',
      HydrateFallback: () => null,
      loader: ({ request }) =>
        new URL(request.url).searchParams.get('cmp-108') === '' ? pending.promise : null,
      Component: () => {
        const location = useLocation();
        const navigation = useNavigation();
        const navigate = useNavigate();
        return (
          <>
            <button type="button" onClick={() => navigate('?as=E08000003&cmp-108=')}>
              Untick England
            </button>
            <IndicatorGeographies
              shortId={108}
              displayGroups={[]}
              selection={{ areaCodes: ['E08000003'], areaLevels: [], shortIds: [108] }}
            />
            <output data-testid="location">{navigation.location?.search ?? location.search}</output>
          </>
        );
      },
    },
  ]);
  render(<Routes initialEntries={['/?as=E08000003&cmp-108=england']} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Untick England' }));
  await waitFor(() => expect(screen.getByTestId('location').textContent).toContain('cmp-108='));
  fireEvent.click(screen.getByRole('link', { name: 'Clear filter' }));
  await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('?cmp-108='));
  await act(async () => pending.resolve(null));
});

function mountWithNotice(notice: 'england-only' | 'others-unavailable') {
  const Routes = createRoutesStub([
    {
      path: '/',
      Component: () => (
        <IndicatorGeographies
          shortId={108}
          displayGroups={notice === 'england-only' ? [] : ['NHS regions']}
          selection={{ areaCodes: [], areaLevels: [], shortIds: [108] }}
          notice={notice}
        />
      ),
    },
  ]);
  return render(<Routes initialEntries={['/']} />);
}

it('says England is the only geography in place of the search and area types', () => {
  const { container } = mountWithNotice('england-only');
  expect(screen.getByText('Data only available for England')).toBeTruthy();
  expect(screen.queryByRole('searchbox')).toBeNull();
  expect(container.querySelector('form')).toBeNull();
  expect(screen.queryByText('Data unavailable for other area types')).toBeNull();
});

it('says other area types have no data below the choices, and keeps saying so while searching', () => {
  mountWithNotice('others-unavailable');
  const hint = screen.getByText('Data unavailable for other area types');
  expect(hint.className).toContain('govuk-hint');
  expect(screen.getByRole('checkbox', { name: /NHS regions/ })).toBeTruthy();
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search for a geography' }), {
    target: { value: 'Lon' },
  });
  expect(screen.getByText('Data unavailable for other area types')).toBeTruthy();
});
