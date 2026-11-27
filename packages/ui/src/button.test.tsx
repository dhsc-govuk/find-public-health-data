// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Button } from './button.tsx';

afterEach(cleanup);

/** Clicks the button twice in quick succession, answering whether each click went ahead. */
function doubleClick(button: HTMLElement): [boolean, boolean] {
  return [fireEvent.click(button), fireEvent.click(button)];
}

describe('Button', () => {
  it('ignores a second press of a submit button straight after the first', () => {
    render(<Button>Continue</Button>);
    const button = screen.getByRole('button', { name: 'Continue' });

    expect(button.getAttribute('type')).toBe('submit');
    expect(button.getAttribute('data-prevent-double-click')).toBe('true');
    expect(doubleClick(button)).toEqual([true, false]);
  });

  it('lets a submit button opt out, so every press goes ahead', () => {
    render(
      <Button preventDoubleClick={false} type="submit">
        Continue
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Continue' });

    expect(button.getAttribute('data-prevent-double-click')).toBeNull();
    expect(doubleClick(button)).toEqual([true, true]);
  });

  it.each(['button', 'reset'] as const)(
    'leaves a %s button alone, as a second press there can mean something',
    (type) => {
      const onClick = vi.fn();
      render(
        <Button onClick={onClick} type={type}>
          Copy link
        </Button>,
      );
      const button = screen.getByRole('button', { name: 'Copy link' });

      expect(button.getAttribute('data-prevent-double-click')).toBeNull();
      doubleClick(button);
      expect(onClick).toHaveBeenCalledTimes(2);
    },
  );

  it('renders a link styled as a button as a plain link', () => {
    render(
      <MemoryRouter>
        <Button href="/publish/indicators/new">Create new indicator</Button>
      </MemoryRouter>,
    );
    const link = screen.getByRole('button', { name: 'Create new indicator' });

    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/publish/indicators/new');
    expect(link.hasAttribute('data-prevent-double-click')).toBe(false);
  });
});
