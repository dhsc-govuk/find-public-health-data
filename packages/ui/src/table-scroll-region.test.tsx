// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TableScrollRegion } from './table-scroll-region.tsx';

afterEach(cleanup);

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
      for (const element of container.querySelectorAll(selector)) {
        expect(element.getAttribute('aria-hidden')).toBe('true');
      }
    }
  });
});
