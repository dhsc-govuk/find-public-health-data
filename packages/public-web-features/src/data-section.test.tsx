// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it } from 'vitest';
import { DataSection, useDataReady } from './data-section.tsx';

afterEach(cleanup);

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

it('puts completed content in the initial HTML without a loading fallback', () => {
  const html = renderToString(
    <MemoryRouter>
      <DataSection label="data" resolve={{ value: 'Complete table' }}>
        {({ value }) => <p>{value}</p>}
      </DataSection>
    </MemoryRouter>,
  );
  expect(html).toContain('Complete table');
  expect(html).not.toContain('Loading');
  expect(html).not.toContain('<template');
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
