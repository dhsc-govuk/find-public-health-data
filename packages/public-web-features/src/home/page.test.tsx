// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { PublicHomePage } from './page.tsx';

afterEach(cleanup);

function renderPage() {
  return render(
    <MemoryRouter>
      <PublicHomePage />
    </MemoryRouter>,
  );
}

describe('PublicHomePage', () => {
  it('offers a search form and a Browse all data card', () => {
    renderPage();

    expect(screen.getByLabelText('Search for data')).toBeTruthy();
    expect(screen.getByText('For example, diabetes or mental health')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Browse all data' }).getAttribute('href')).toBe(
      '/search',
    );
  });

  it('orders the page as the latest prototype does', () => {
    const { container } = renderPage();

    const texts = [
      ...container.querySelectorAll(
        'h1, .govuk-body-l, .govuk-inset-text, .govuk-label--m, .govuk-hint, h2, .fphd-card-list__link',
      ),
    ].map((element) => element.textContent?.trim());

    expect(texts).toEqual([
      'Find public health data',
      expect.stringMatching(/^Search and browse public health data for England\./),
      'This service was previously known as Fingertips.',
      'Search for data',
      'For example, diabetes or mental health',
      'Ways to find data',
      'Browse by topic',
      'Browse all data',
      'Public health data',
      'Using this service',
    ]);
  });

  it('offers only the topic and all-data cards, with no geography, framework or programme, or recently updated card', () => {
    renderPage();

    const cards = screen
      .getAllByRole('listitem')
      .flatMap((item) => within(item).queryAllByRole('link'));

    expect(cards.map((card) => card.textContent)).toEqual(['Browse by topic', 'Browse all data']);
    expect(cards.map((card) => card.getAttribute('href'))).toEqual(['/topics', '/search']);
  });
});
