// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { CardList } from './card-list.tsx';

afterEach(cleanup);

const items = [
  { href: '/topics/smoking', title: 'Smoking', description: 'Prevalence and quitting.' },
  { href: '/topics/obesity', title: 'Obesity' },
];

// The card link is a router-aware anchor, so it needs a router around it.
function renderCards(props: Omit<ComponentProps<typeof CardList>, 'items'> = {}) {
  return render(
    <MemoryRouter>
      <CardList {...props} items={items} />
    </MemoryRouter>,
  );
}

describe('CardList', () => {
  it('links each card title to its page', () => {
    renderCards();

    expect(screen.getByRole('link', { name: 'Smoking' }).getAttribute('href')).toBe(
      '/topics/smoking',
    );
    expect(screen.getByRole('link', { name: 'Obesity' }).getAttribute('href')).toBe(
      '/topics/obesity',
    );
  });

  it('shows a description only for cards that have one', () => {
    renderCards();

    expect(screen.getByText('Prevalence and quitting.')).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getAllByRole('paragraph')).toHaveLength(1);
  });

  it('lays the cards out in one column unless the page asks for more', () => {
    renderCards();

    expect(screen.getByRole('list').className).toBe('fphd-card-list fphd-card-list--one-column');
  });

  it('lays the cards out in two columns when the page asks for two', () => {
    renderCards({ columns: 'two' });

    expect(screen.getByRole('list').className).toBe('fphd-card-list fphd-card-list--two-column');
  });

  it('renders card titles at the heading level the page asks for', () => {
    renderCards({ headingLevel: 2 });

    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(2);
    expect(screen.queryByRole('heading', { level: 3 })).toBeNull();
  });

  it('highlights non-overlapping case-insensitive matches in titles and descriptions', () => {
    const { container } = renderCards({ searchTerm: '  I  ' });

    expect([...container.querySelectorAll('mark')].map((mark) => mark.textContent)).toEqual([
      'i',
      'i',
      'i',
      'i',
    ]);
    expect(screen.getByRole('link', { name: 'Smoking' })).toBeTruthy();
    expect(screen.getByRole('paragraph').textContent).toBe('Prevalence and quitting.');
  });

  it('treats search punctuation and content as literal text', () => {
    const { container } = render(
      <MemoryRouter>
        <CardList
          items={[{ href: '/example', title: '<script>A&E (care)</script>' }]}
          searchTerm="(care)"
        />
      </MemoryRouter>,
    );

    expect(container.querySelector('mark')?.textContent).toBe('(care)');
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByRole('link', { name: '<script>A&E (care)</script>' })).toBeTruthy();
  });

  it('leaves content unmarked when the search term is empty', () => {
    const { container } = renderCards({ searchTerm: '  ' });

    expect(container.querySelector('mark')).toBeNull();
  });

  it('highlights Unicode matches while preserving the original characters', () => {
    const { container } = render(
      <MemoryRouter>
        <CardList items={[{ href: '/example', title: 'KK' }]} searchTerm="k" />
      </MemoryRouter>,
    );

    expect([...container.querySelectorAll('mark')].map((mark) => mark.textContent)).toEqual([
      'K',
      'K',
    ]);
  });
});
