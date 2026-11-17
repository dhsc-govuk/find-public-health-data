// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMemoryRouter, createRoutesStub, RouterProvider, useLocation } from 'react-router';
import { afterEach, expect, it } from 'vitest';
import { highlightedAreaCodes } from './area-comparison.ts';
import { AreaControls, AreaSortControl } from './area-controls.tsx';

afterEach(cleanup);

const areas = Array.from({ length: 4 }, (_, index) => ({
  code: `E0600000${index + 1}`,
  name: `Area ${index + 1}`,
  parent: { code: 'E12000001', name: 'North East' },
  neighbours: ['E06000005'],
}));
const initialQuery =
  'highlight=E06000001&highlight=E06000002&highlight=E06000003&highlight=E06000004&neighbours=E06000004';

function mount(displayOptions = true, query = initialQuery) {
  const Routes = createRoutesStub([
    {
      path: '/',
      Component: () => (
        <>
          <AreaControls
            slug="indicator-108"
            group="Local authorities"
            groups={['Local authorities']}
            areas={areas}
            displayOptions={displayOptions}
          />
          <AreaSortControl areas={areas} />
          <output aria-label="Current query">{useLocation().search}</output>
        </>
      ),
    },
  ]);
  return render(<Routes initialEntries={[`/?${query}`]} />);
}

it('collapses additional anchors while preserving a ticked neighbour checkbox', () => {
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Show fewer areas' }));
  expect(screen.queryByRole('checkbox', { name: 'Statistical neighbours for Area 4' })).toBeNull();
  expect(
    (
      screen.getByRole('checkbox', {
        name: 'Statistical neighbours for Area 4',
        hidden: true,
      }) as HTMLInputElement
    ).checked,
  ).toBe(true);
  expect(
    screen.getByRole('button', { name: 'Show 1 more area' }).getAttribute('aria-expanded'),
  ).toBe('false');
});

it('preserves the neighbours selection in both geography forms without JavaScript', () => {
  const { container } = mount();
  for (const form of [...container.querySelectorAll('form')].slice(0, 2)) {
    expect(new FormData(form).getAll('neighbours')).toEqual(['E06000004']);
  }
});

it('submits each ticked neighbour once and removes unticked neighbours without JavaScript', () => {
  const { container } = mount();
  const form = container.querySelector<HTMLFormElement>('.fphd-compare-neighbours');
  if (!form) throw new Error('Expected neighbours form');
  expect(new FormData(form).getAll('neighbours')).toEqual(['E06000004']);
  const checkbox = form.querySelector<HTMLInputElement>(
    'input[type="checkbox"][value="E06000004"]',
  );
  if (!checkbox) throw new Error('Expected selected neighbour');
  checkbox.checked = false;
  expect(new FormData(form).getAll('neighbours')).toEqual([]);
});

it('preserves every other selection in a no-script sort submission', () => {
  const query = `${initialQuery}&highlightRegion=E12000001&areaColour=quintiles&geo-q=Area&areaSort=descending`;
  const { container } = mount(true, query);
  const form = container.querySelector<HTMLFormElement>('.fphd-area-sort');
  if (!form) throw new Error('Expected sort form');
  const select = form.querySelector('select');
  if (!select) throw new Error('Expected sort dropdown');
  select.value = 'alphabetical';
  const expected = new URLSearchParams(query);
  expected.set('areaSort', 'alphabetical');
  expect([...new FormData(form)]).toEqual([...expected]);
});

it('removes neighbour anchors when their last highlighted area is unticked', async () => {
  mount(true, 'highlight=E06000004&neighbours=E06000004');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Area 4' }));
  await waitFor(() =>
    expect(screen.getByRole('status', { name: 'Current query' }).textContent).not.toContain(
      'neighbours=',
    ),
  );
});

it('does not propagate orphaned neighbours in subsequent no-script forms', () => {
  const { container } = mount(true, 'neighbours=E06000004');
  for (const form of container.querySelectorAll('form')) {
    expect(new FormData(form).getAll('neighbours')).toEqual([]);
  }
});

it('offers individual area highlights without region controls on Compare indicators', () => {
  mount(false);
  expect(screen.queryByRole('checkbox', { name: /North East/ })).toBeNull();
  expect(screen.getByRole('checkbox', { name: 'Area 1' })).toBeTruthy();
});

it.each(['Area 1', 'e06000001'])(
  'matches the picker and no-script region reconciliation for %s before hydration',
  (query) => {
    const params = new URLSearchParams({ 'geo-q': query, highlightRegion: 'E12000001' });
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: (
            <AreaControls
              slug="indicator-108"
              group="Local authorities"
              groups={['Local authorities']}
              areas={areas}
            />
          ),
        },
      ],
      { initialEntries: [`/?${params}`] },
    );
    const document = new DOMParser().parseFromString(
      renderToStaticMarkup(<RouterProvider router={router} />),
      'text/html',
    );
    const shown = [
      ...document.querySelectorAll<HTMLInputElement>('input[type="checkbox"][name="highlight"]'),
    ];
    expect(shown.map(({ value }) => value)).toEqual(['E06000001']);
    expect(shown.every(({ checked }) => checked)).toBe(true);
    expect(highlightedAreaCodes(params, areas)).toEqual(['E06000001']);
    expect(
      document.querySelector('input[name="highlightRegion"]')?.getAttribute('aria-label'),
    ).toBe('North East: all 1 upper tier local authorities');
    router.dispose();
  },
);
