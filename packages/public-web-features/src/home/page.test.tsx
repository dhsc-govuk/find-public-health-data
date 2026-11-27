// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { PublicHomePage } from './page.tsx';

afterEach(cleanup);

describe('PublicHomePage', () => {
  it('offers a search form and a Browse all data card', () => {
    render(
      <MemoryRouter>
        <PublicHomePage />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText('Search for data')).toBeTruthy();
    expect(screen.getByText('For example, diabetes or mental health')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Browse all data' }).getAttribute('href')).toBe(
      '/search',
    );
  });
});
