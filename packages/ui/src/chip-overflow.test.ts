import { describe, expect, it } from 'vitest';
import { chipOverflow } from './chip-overflow.ts';

const rect = (top: number, bottom = top + 30) => ({ top, bottom });

describe('chipOverflow', () => {
  it.each([{ rects: [] }, { rects: [rect(0)] }, { rects: [rect(0), rect(0), rect(35), rect(35)] }])(
    'does not collapse chips within two lines: $rects',
    ({ rects }) => {
      expect(chipOverflow(rects)).toBeNull();
    },
  );

  it('finds the chips and bottom edge of the second line', () => {
    expect(chipOverflow([rect(100), rect(100), rect(135), rect(135), rect(170)])).toEqual({
      bottom: 163,
      shown: 4,
    });
  });

  it('uses the tallest chip on a line, allowing for centred items and fractional pixels', () => {
    expect(
      chipOverflow([
        rect(10, 50.5),
        rect(15, 45),
        rect(55.5, 95.5),
        rect(60.5, 90.5),
        rect(100.5, 130.5),
      ]),
    ).toEqual({ bottom: 93.5, shown: 4 });
  });

  it('allows two pixels of rounding at a line boundary', () => {
    expect(chipOverflow([rect(0), rect(28), rect(56)])).toEqual({ bottom: 56, shown: 2 });
  });
});
