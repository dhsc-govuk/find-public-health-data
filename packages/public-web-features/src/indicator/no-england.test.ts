import { describe, expect, it } from 'vitest';
import { englandObservations, noEnglandLevel, summaryObservations } from './no-england.ts';
import { observation } from './view.testing.ts';

const england = (observations = [observation(10)]) => ({ areaCode: 'E92000001', observations });
const area = (areaCode: string, value: number, fromDate: string) => ({
  areaCode,
  observations: [{ ...observation(value), fromDate, toDate: fromDate.replace('-01-01', '-12-31') }],
});

describe('englandObservations', () => {
  it("returns England's observations", () => {
    expect(englandObservations([area('E12000001', 5, '2024-01-01'), england()])).toEqual([
      observation(10),
    ]);
  });

  it('returns none when England is answered with no observations or left out', () => {
    expect(englandObservations([england([])])).toEqual([]);
    expect(englandObservations([area('E12000001', 5, '2024-01-01')])).toEqual([]);
  });
});

describe('noEnglandLevel', () => {
  const levels = ['Local authorities', 'NHS regions', 'Statistical regions'];

  it('opens on no other level when England has a value', () => {
    expect(noEnglandLevel(england(), levels)).toBeUndefined();
  });

  it('opens on the statistical regions, then the NHS regions, when England has no value', () => {
    expect(noEnglandLevel(england([]), levels)).toBe('Statistical regions');
    expect(noEnglandLevel(undefined, ['Local authorities', 'NHS regions'])).toBe('NHS regions');
  });

  it('opens on no level when the indicator has data for neither kind of region', () => {
    expect(noEnglandLevel(england([]), ['Local authorities', 'Integrated care boards'])).toBe(
      undefined,
    );
  });
});

describe('summaryObservations', () => {
  const regions = [area('E12000001', 5, '2019-01-01'), area('E12000002', 6, '2023-01-01')];

  it("describes England's values when England has some", () => {
    const shown = [...regions, england()];
    expect(summaryObservations(shown, true)).toEqual({
      period: [observation(10)],
      trend: [observation(10)],
    });
  });

  it('spans every area shown, with no trend, when England has no value and nothing is chosen', () => {
    const { period, trend } = summaryObservations([...regions, england([])], false);
    expect(period.map(({ fromDate }) => fromDate)).toEqual(['2019-01-01', '2023-01-01']);
    expect(trend).toBeNull();
  });

  it("takes the first chosen area's trend when England has no value", () => {
    const { trend } = summaryObservations([...regions, england([])], true);
    expect(trend).toEqual(regions[0]?.observations);
  });
});
