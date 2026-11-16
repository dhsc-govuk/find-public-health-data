// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TableScrollRegion } from './table-scroll-region.tsx';

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('TableScrollRegion', () => {
  it('wraps the table in a labelled region keyboard users can focus', () => {
    render(
      <TableScrollRegion label="Trends over time">
        <table>
          <tbody>
            <tr>
              <td>1</td>
            </tr>
          </tbody>
        </table>
      </TableScrollRegion>,
    );
    const region = screen.getByRole('region', { name: 'Trends over time' });

    expect(region.tabIndex).toBe(0);
    expect(region.querySelector('table')).toBeTruthy();
  });

  it('hides its scrollbar, caption copy and edge shadows from screen readers', () => {
    const { container } = render(
      <TableScrollRegion label="Trends over time">
        <table />
      </TableScrollRegion>,
    );

    for (const selector of [
      '.fphd-table-scrollbar',
      '.fphd-table-caption-copy',
      '.fphd-table-edge',
    ]) {
      expect(container.querySelectorAll(selector).length).toBeGreaterThan(0);
      for (const element of container.querySelectorAll(selector)) {
        expect(element.getAttribute('aria-hidden')).toBe('true');
      }
    }
  });

  it('preserves the scrollbar’s React parent and unmounts while pinned', () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockReturnValue(document.body);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(500);
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(1500);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(24);
    let top = 100;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      return new DOMRect(20, top, 500, this.tagName === 'THEAD' ? 40 : 800);
    });
    const { container, unmount } = render(
      <TableScrollRegion label="Trends over time">
        <table>
          <thead>
            <tr>
              <th>Period</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>2024</td>
            </tr>
          </tbody>
        </table>
      </TableScrollRegion>,
      { wrapper: StrictMode },
    );
    const bar = container.querySelector('.fphd-table-scrollbar') as HTMLElement;
    const reactParent = bar.parentElement;

    act(() => {
      top = -200;
      window.dispatchEvent(new Event('scroll'));
      for (const frame of frames.splice(0)) frame(0);
    });
    expect(bar.classList).toContain('fphd-table-scrollbar--floating');
    const pinnedParent = bar.parentElement;

    expect(() => unmount()).not.toThrow();
    expect(document.querySelector('.fphd-sticky-header')).toBeNull();
    expect(document.querySelector('.fphd-table-scrollbar')).toBeNull();
    expect(pinnedParent).toBe(reactParent);
  });
});
