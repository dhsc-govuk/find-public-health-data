// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CollapsibleFilterCard } from './filter-card.tsx';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('CollapsibleFilterCard', () => {
  it.each([true, false])(
    'defaults to expanded only on desktop when requested (desktop: %s)',
    (matches) => {
      vi.stubGlobal('matchMedia', () => ({ matches }));
      render(
        <CollapsibleFilterCard active={false} defaultOpenOnDesktop title="Benchmarks">
          Filters
        </CollapsibleFilterCard>,
      );
      const toggle = screen.getByRole('button', { name: 'Benchmarks' });
      expect(toggle.getAttribute('aria-expanded')).toBe(String(matches));
      fireEvent.click(toggle);
      expect(toggle.getAttribute('aria-expanded')).toBe(String(!matches));
    },
  );

  it('server renders the title and enhanced toggle', () => {
    const html = renderToString(
      <CollapsibleFilterCard active={false} title="Topics and types">
        Filters
      </CollapsibleFilterCard>,
    );

    expect(html).toContain('<span>Topics and types</span>');
    expect(html).toContain('class="fphd-filter-card__toggle');
  });

  it('makes the title a heading at the level asked for', () => {
    render(
      <CollapsibleFilterCard active={false} headingLevel={2} title="Topics and types">
        Filters
      </CollapsibleFilterCard>,
    );

    expect(screen.getByRole('heading', { level: 2, name: 'Topics and types' })).toBeTruthy();
  });

  it('leaves the title as plain text with no heading level', () => {
    render(
      <CollapsibleFilterCard active={false} headingLevel={null} title="Geographies">
        Filters
      </CollapsibleFilterCard>,
    );

    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByRole('button', { name: 'Geographies' })).toBeTruthy();
  });

  it('toggles the body', () => {
    render(
      <CollapsibleFilterCard active={false} title="Topics and types">
        Filters
      </CollapsibleFilterCard>,
    );

    const toggle = screen.getByRole('button', { name: 'Topics and types' });
    const body = screen.getByText('Filters');

    expect(body.hidden).toBe(true);

    fireEvent.click(toggle);

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(body.hidden).toBe(false);

    fireEvent.click(toggle);

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(body.hidden).toBe(true);
  });
});
