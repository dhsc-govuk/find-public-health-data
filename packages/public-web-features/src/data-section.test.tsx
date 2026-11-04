// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it } from 'vitest';
import { DataSection } from './data-section.tsx';

afterEach(cleanup);

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
