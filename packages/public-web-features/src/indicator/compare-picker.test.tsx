// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { createRoutesStub } from 'react-router';
import { afterEach, expect, it } from 'vitest';
import { ComparePicker } from './compare-picker.tsx';

afterEach(cleanup);

it('links each search result by its short id, never its slug', async () => {
  const Routes = createRoutesStub([
    {
      path: 'indicator/:slug',
      Component: () => (
        <ComparePicker
          name="Diabetes prevalence"
          slug="indicator-241"
          findSubject="mortality"
          findResults={[
            {
              shortId: 108,
              slug: 'under-75-mortality-rate-from-all-causes-in-people-with-a-long-term-condition',
              name: 'Under 75 mortality rate',
            },
          ]}
        />
      ),
    },
  ]);

  render(<Routes initialEntries={['/indicator/indicator-241?find=mortality&as=E08000003']} />);

  expect(
    (await screen.findByRole('link', { name: 'Under 75 mortality rate' })).getAttribute('href'),
  ).toBe(
    '/indicator/indicator-241?as=E08000003&compareWith=108&tab-indicator=compare#indicator-compare-indicators',
  );
});
