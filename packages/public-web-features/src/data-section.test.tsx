// @vitest-environment jsdom
import { CollapsibleFilterCard } from '@fphd/ui';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it } from 'vitest';
import { DataSection, useDataReady } from './data-section.tsx';

afterEach(cleanup);

it('shows loading rather than a failure on the first client commit', () => {
  let firstCommit: string | null = null;
  function FirstCommit() {
    useLayoutEffect(() => {
      firstCommit = document.body.textContent;
    }, []);
    return null;
  }

  render(
    <MemoryRouter>
      <DataSection label="data" resolve={new Promise<string>(() => {})}>
        {(value) => <p>{value}</p>}
      </DataSection>
      <FirstCommit />
    </MemoryRouter>,
  );

  expect(firstCommit).toContain('Loading data…');
  expect(firstCommit).not.toContain('could not be loaded');
});

it('keeps an open control when document data becomes deferred navigation data', async () => {
  const section = Promise.withResolvers<string>();
  const content = (resolve: string | Promise<string>) => (
    <MemoryRouter>
      <DataSection label="data" resolve={resolve}>
        {(value) => (
          <CollapsibleFilterCard active={false} title="Table columns">
            <p>{value}</p>
          </CollapsibleFilterCard>
        )}
      </DataSection>
    </MemoryRouter>
  );
  const { rerender } = render(content('Document table'));
  fireEvent.click(screen.getByRole('button', { name: 'Table columns' }));
  expect(screen.getByRole('button', { name: 'Table columns' }).getAttribute('aria-expanded')).toBe(
    'true',
  );

  rerender(content(section.promise));
  await act(async () => section.resolve('Navigation table'));

  expect(screen.getByText('Navigation table')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Table columns' }).getAttribute('aria-expanded')).toBe(
    'true',
  );
});

it('waits for every section in an array and tracks replacement promises', async () => {
  const sections = Array.from({ length: 4 }, () => Promise.withResolvers<void>());
  const values = sections.map(({ promise }) => promise);
  const { result, rerender } = renderHook(({ values }) => useDataReady(values), {
    initialProps: { values },
  });
  expect(result.current).toBe(false);
  await act(async () => {
    for (const section of sections.slice(0, -1)) section.resolve();
  });
  expect(result.current).toBe(false);
  await act(async () => sections.at(-1)?.reject(new Error('Unavailable')));
  expect(result.current).toBe(true);
  rerender({ values: [...values] });
  expect(result.current).toBe(true);
  const replacement = Promise.withResolvers<void>();
  rerender({ values: [replacement.promise] });
  expect(result.current).toBe(false);
  await act(async () => replacement.resolve());
  expect(result.current).toBe(true);
});

it('renders navigation while sections load and reveals each section independently', async () => {
  const overview = Promise.withResolvers<string>();
  const table = Promise.withResolvers<string>();
  render(
    <MemoryRouter>
      <h1>Topic</h1>
      <nav>Contents</nav>
      <DataSection label="overview" resolve={overview.promise}>
        {(value) => <p>{value}</p>}
      </DataSection>
      <DataSection label="data" resolve={table.promise}>
        {(value) => <p>{value}</p>}
      </DataSection>
    </MemoryRouter>,
  );
  expect(screen.getByRole('heading', { name: 'Topic' })).toBeTruthy();
  expect(screen.getByRole('navigation')).toBeTruthy();
  expect(screen.getByText('Loading overview…')).toBeTruthy();
  expect(screen.getByText('Loading data…')).toBeTruthy();
  overview.resolve('Overview loaded');
  expect(await screen.findByText('Overview loaded')).toBeTruthy();
  expect(screen.getByText('Loading data…')).toBeTruthy();
  table.resolve('Table loaded');
  expect(await screen.findByText('Table loaded')).toBeTruthy();
});

it('keeps a failed section inside its boundary with a retry link', async () => {
  const data = Promise.withResolvers<string>();
  render(
    <MemoryRouter initialEntries={['/topics/cancer?geo=NHS+regions']}>
      <h1>Cancer</h1>
      <DataSection label="Data" resolve={data.promise}>
        {(value) => <p>{value}</p>}
      </DataSection>
    </MemoryRouter>,
  );
  data.reject(new Error('Unavailable'));
  expect((await screen.findByRole('link', { name: 'Try again' })).getAttribute('href')).toBe(
    '/topics/cancer?geo=NHS+regions',
  );
  expect(screen.getByRole('heading', { name: 'Cancer' })).toBeTruthy();
});
