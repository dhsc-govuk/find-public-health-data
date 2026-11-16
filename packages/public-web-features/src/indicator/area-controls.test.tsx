// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createRoutesStub } from 'react-router';
import { afterEach, expect, it } from 'vitest';
import { AreaControls } from './area-controls.tsx';

afterEach(cleanup);

const areas = Array.from({ length: 4 }, (_, index) => ({
  code: `E0600000${index + 1}`,
  name: `Area ${index + 1}`,
  parent: { code: 'E12000001', name: 'North East' },
  neighbours: ['E06000005'],
}));
function mount(displayOptions = true) {
  const Routes = createRoutesStub([
    {
      path: '/',
      Component: () => (
        <AreaControls
          slug="indicator-108"
          group="Local authorities"
          groups={['Local authorities']}
          areas={areas}
          displayOptions={displayOptions}
        />
      ),
    },
  ]);
  return render(
    <Routes
      initialEntries={[
        '/?highlight=E06000001&highlight=E06000002&highlight=E06000003&highlight=E06000004&neighbours=E06000004',
      ]}
    />,
  );
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

it('offers individual area highlights without region controls on Compare indicators', () => {
  mount(false);
  expect(screen.queryByRole('checkbox', { name: /North East/ })).toBeNull();
  expect(screen.getByRole('checkbox', { name: 'Area 1' })).toBeTruthy();
});
