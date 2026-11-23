// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, expect, it } from 'vitest';

import { SearchFilterPane } from './filter-pane.tsx';
import { EMPTY_SEARCH_STATE } from './url.ts';

afterEach(cleanup);

it('uses dimension and slug together for classification labels', () => {
  const router = createMemoryRouter([
    {
      path: '/',
      element: (
        <SearchFilterPane
          state={{ ...EMPTY_SEARCH_STATE, indicatorTypes: ['shared'], lifeStages: ['shared'] }}
          facets={{
            topics: [],
            classifications: [
              { dimension: 'indicator_type', slug: 'shared', name: 'Indicator type label' },
              { dimension: 'life_stage', slug: 'shared', name: 'Life stage label' },
            ],
            sources: [],
            valueTypes: [],
            yearTypes: [],
          }}
        />
      ),
    },
  ]);
  render(<RouterProvider router={router} />);

  expect(screen.getByText('Indicator type label')).toBeTruthy();
  expect(screen.getByText('Life stage label')).toBeTruthy();
});

it('offers the data period filters without a Status filter', () => {
  const router = createMemoryRouter([
    {
      path: '/',
      element: (
        <SearchFilterPane
          includeDataPeriod
          state={EMPTY_SEARCH_STATE}
          facets={{ topics: [], classifications: [], sources: [], valueTypes: [], yearTypes: [] }}
        />
      ),
    },
  ]);
  render(<RouterProvider router={router} />);

  expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
    'Topics and types',
    'Frameworks and programmes',
    'About the data',
    'Years the data covers',
    'Last updated',
  ]);
});
