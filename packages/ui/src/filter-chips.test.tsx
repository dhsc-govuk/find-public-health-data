// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FilterChip, FilterChips } from './filter-card.tsx';

let columns: number;
let width: number;
let buttonSlots: number;
let resize: () => void;
const observe = vi.fn();
const disconnect = vi.fn();

function ChipRow({ count = 6, collapse = true }) {
  return (
    <MemoryRouter>
      <div>
        <span>Showing:</span>
        <FilterChips collapse={collapse}>
          {Array.from({ length: count }, (_, index) => (
            <FilterChip
              key={index}
              value={String(index)}
              onRemove={`/?remove=${index}`}
              removeLabel={`Chip ${index + 1}`}
            >
              Chip {index + 1}
            </FilterChip>
          ))}
        </FilterChips>
        <a href="/">Clear all</a>
      </div>
    </MemoryRouter>
  );
}

beforeEach(() => {
  columns = 2;
  width = 200;
  buttonSlots = 1;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        resize = () => callback([], this as unknown as ResizeObserver);
      }
      observe = observe;
      disconnect = disconnect;
    },
  );
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => width);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const chips = [...(this.parentElement?.children ?? [])].filter(
      (child) => child.classList.contains('fphd-filter-chip') && !(child as HTMLElement).hidden,
    );
    const index = this.classList.contains('fphd-filter-chips__more')
      ? chips.length + buttonSlots - 1
      : chips.indexOf(this);
    const top = Math.floor(index / columns) * 40;
    return new DOMRect(0, top, 90, 30);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('FilterChips overflow', () => {
  it('reserves space for the button, hides overflow from everyone and preserves Clear all', () => {
    const { container } = render(<ChipRow />);
    const button = screen.getByRole('button', { name: 'Show 3 more filters' });
    const list = container.querySelector('.fphd-filter-chips');
    const clear = screen.getByRole('link', { name: 'Clear all' });

    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.getAttribute('aria-controls')).toBe(list?.id);
    expect(button.classList.contains('fphd-link-button')).toBe(true);
    expect(button.classList.contains('fphd-filter-chips__more')).toBe(true);
    expect(list?.lastElementChild).toBe(button);
    expect(list?.nextElementSibling).toBe(clear);
    expect(screen.getAllByRole('link', { name: /^Remove Chip/ })).toHaveLength(3);
    expect(container.querySelectorAll('.fphd-filter-chip[hidden]')).toHaveLength(3);
    expect(screen.queryByRole('link', { name: 'Remove Chip 4 filter' })).toBeNull();

    button.focus();
    fireEvent.click(button);
    expect(screen.getByRole('button', { name: 'Show fewer filters' })).toBe(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByRole('link', { name: /^Remove Chip/ })).toHaveLength(6);
    expect(container.querySelectorAll('.fphd-filter-chip[hidden]')).toHaveLength(0);
    expect(document.activeElement).toBe(button);
    expect(list?.nextElementSibling).toBe(clear);

    fireEvent.click(button);
    expect(button.textContent).toBe('Show 3 more filters');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getAllByRole('link', { name: /^Remove Chip/ })).toHaveLength(3);
    expect(document.activeElement).toBe(button);
  });

  it('uses the singular label when one filter is hidden', () => {
    columns = 1;
    buttonSlots = 0;
    render(<ChipRow count={3} />);
    expect(screen.getByRole('button', { name: 'Show 1 more filter' })).toBeTruthy();
    expect(screen.getAllByRole('link', { name: /^Remove Chip/ })).toHaveLength(2);
  });

  it('allows for a wider toggle that needs more than one chip to be removed', () => {
    columns = 3;
    buttonSlots = 2;
    render(<ChipRow count={7} />);
    expect(screen.getByRole('button', { name: 'Show 3 more filters' })).toBeTruthy();
    expect(screen.getAllByRole('link', { name: /^Remove Chip/ })).toHaveLength(4);
  });

  it('does not show a button for two lines, or when overflow is not enabled', () => {
    const { rerender } = render(<ChipRow count={4} />);
    expect(screen.queryByRole('button')).toBeNull();
    rerender(<ChipRow collapse={false} />);
    expect(screen.queryByRole('button', { hidden: true })).toBeNull();
    expect(screen.getAllByRole('link', { name: /^Remove Chip/ })).toHaveLength(6);
  });

  it('recalculates on chip additions and removals, including while expanded', () => {
    const { rerender } = render(<ChipRow />);
    rerender(<ChipRow count={7} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show 4 more filters' }));
    rerender(<ChipRow count={8} />);
    expect(screen.getByRole('button', { name: 'Show fewer filters' })).toBeTruthy();
    expect(screen.getAllByRole('link', { name: /^Remove Chip/ })).toHaveLength(8);
    fireEvent.click(screen.getByRole('button', { name: 'Show fewer filters' }));
    expect(screen.getByRole('button', { name: 'Show 5 more filters' })).toBeTruthy();
    rerender(<ChipRow count={3} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getAllByRole('link', { name: /^Remove Chip/ })).toHaveLength(3);
  });

  it('recalculates when a hidden tab becomes visible, and on subsequent resizes', () => {
    width = 0;
    const { container } = render(<ChipRow />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(observe).toHaveBeenCalledWith(container.querySelector('.fphd-filter-chips'));

    act(() => {
      width = 200;
      resize();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Show 3 more filters' }));
    act(() => {
      columns = 6;
      resize();
    });
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getAllByRole('link', { name: /^Remove Chip/ })).toHaveLength(6);
    act(() => {
      columns = 2;
      resize();
    });
    const button = screen.getByRole('button', { name: 'Show fewer filters' });
    expect(button.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(button);
    expect(screen.getByRole('button', { name: 'Show 3 more filters' })).toBeTruthy();
  });

  it('keeps all chips available when ResizeObserver is unavailable', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    render(<ChipRow />);
    expect(screen.queryByRole('button', { hidden: true })).toBeNull();
    expect(screen.getAllByRole('link', { name: /^Remove Chip/ })).toHaveLength(6);
  });

  it('disconnects its observer and load handler on unmount in StrictMode', () => {
    const removeListener = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(<ChipRow />, { wrapper: StrictMode });
    disconnect.mockClear();
    removeListener.mockClear();
    unmount();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(removeListener).toHaveBeenCalledWith('load', expect.any(Function));
  });

  it('server renders every chip with no toggle or hidden content', () => {
    const html = renderToString(<ChipRow />);
    for (let index = 1; index <= 6; index++) {
      expect(html).toContain(`Remove Chip ${index} filter`);
    }
    expect(html).not.toContain('<button');
    expect(html).not.toContain('hidden');
    expect(html).toContain('Clear all');
  });
});
