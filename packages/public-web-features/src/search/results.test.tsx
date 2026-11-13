// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { SearchResults } from './results.tsx';
import { EMPTY_SEARCH_STATE } from './url.ts';

afterEach(cleanup);

function Location() {
  return <output data-testid="location">{useLocation().search}</output>;
}

function renderResults() {
  const router = createMemoryRouter(
    [
      {
        path: '/search',
        element: (
          <>
            <SearchResults
              extraParams={{ 'tab-search': 'indicators' }}
              gaCodes={[]}
              geoLevels={[]}
              searchResult={{ total: 0, limit: 200, indicators: [] }}
              sort="recently-updated"
              state={{
                ...EMPTY_SEARCH_STATE,
                q: 'diabetes',
                topics: ['mortality'],
                updatedWithin: '6',
              }}
            />
            <Location />
          </>
        ),
      },
    ],
    { initialEntries: ['/search?q=diabetes&sort=recently-updated'] },
  );
  render(<RouterProvider router={router} />);
  return screen.getByLabelText<HTMLSelectElement>('Sort by');
}

describe('SearchResults sort', () => {
  it('offers relevance and recently updated, showing the current sort', () => {
    const select = renderResults();

    expect([...select.options].map(({ text }) => text)).toEqual(['Relevance', 'Recently updated']);
    expect(select.value).toBe('recently-updated');
  });

  it('keeps the keyword, filters and tab when the sort form submits', () => {
    const select = renderResults();
    const form = select.form;
    if (!form) throw new Error('The sort select is outside a form');

    expect(form.getAttribute('method')).toBe('get');
    expect(form.getAttribute('action')).toBe('/search');
    expect([...new FormData(form)]).toEqual([
      ['tab-search', 'indicators'],
      ['q', 'diabetes'],
      ['updatedWithin', '6'],
      ['t', 'mortality'],
      ['sort', 'recently-updated'],
    ]);
  });

  it('submits as soon as the sort changes', async () => {
    const select = renderResults();

    fireEvent.change(select, { target: { value: 'relevance' } });

    await waitFor(() =>
      expect(screen.getByTestId('location').textContent).toBe(
        '?tab-search=indicators&q=diabetes&updatedWithin=6&t=mortality&sort=relevance',
      ),
    );
  });
});
