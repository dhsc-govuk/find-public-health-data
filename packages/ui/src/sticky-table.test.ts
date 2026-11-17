import { describe, expect, it } from 'vitest';
import { headerPinned, thumbGeometry } from './sticky-table.ts';

describe('thumbGeometry', () => {
  it('sizes the thumb to the visible share of the table and places it by the scroll', () => {
    expect(
      thumbGeometry({ trackWidth: 400, clientWidth: 400, scrollWidth: 800, scrollLeft: 200 }),
    ).toEqual({ width: 200, left: 100, maxScroll: 400 });
  });

  it('keeps the thumb at least 30px wide', () => {
    expect(
      thumbGeometry({ trackWidth: 300, clientWidth: 300, scrollWidth: 30000, scrollLeft: 0 }).width,
    ).toBe(30);
  });

  it('rests the thumb at the start when nothing scrolls', () => {
    expect(
      thumbGeometry({ trackWidth: 400, clientWidth: 400, scrollWidth: 400, scrollLeft: 0 }).left,
    ).toBe(0);
  });
});

describe('headerPinned', () => {
  it('pins the head once it scrolls under the space the scrollbar takes', () => {
    expect(headerPinned({ headTop: 10, headHeight: 40, tableBottom: 600, above: 30 })).toBe(true);
  });

  it('leaves the head in place while it is still below that space', () => {
    expect(headerPinned({ headTop: 31, headHeight: 40, tableBottom: 600, above: 30 })).toBe(false);
  });

  it('releases the head once the last rows leave the window', () => {
    expect(headerPinned({ headTop: -500, headHeight: 40, tableBottom: 70, above: 30 })).toBe(false);
  });
});
