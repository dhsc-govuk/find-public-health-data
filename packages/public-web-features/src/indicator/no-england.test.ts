import { describe, expect, it } from 'vitest';
import {
  choosesNothing,
  englandObservations,
  noEnglandLevel,
  sexObservations,
  summaryObservations,
} from './no-england.ts';
import { observation, sex } from './view.testing.ts';

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
    expect(summaryObservations(shown)).toEqual({
      period: [observation(10)],
      trend: [observation(10)],
    });
  });

  it('spans every area shown, with no trend, when England has no value', () => {
    const { period, trend } = summaryObservations([...regions, england([])]);
    expect(period.map(({ fromDate }) => fromDate)).toEqual(['2019-01-01', '2023-01-01']);
    expect(trend).toBeNull();
  });
});

describe('choosesNothing', () => {
  const levels = ['Local authorities', 'Statistical regions'];

  it.each([
    ['', true],
    ['as=E92000001', true],
    ['als=', true],
    ['als=Foo', true],
    ['als=NHS%20regions', true],
    ['as=E08000003', false],
    ['als=Statistical%20regions', false],
    ['als=Upper-tier%20local%20authorities', false],
  ])('reads %s as choosing nothing: %s', (query, expected) => {
    expect(choosesNothing(new URLSearchParams(query), levels)).toBe(expected);
  });
});

describe('sexObservations', () => {
  const female = observation(5, [sex('Female')]);
  const male = observation(6, [sex('Male')]);

  it("reads England's observations when England has some", () => {
    expect(
      sexObservations([
        { areaCode: 'E12000001', observations: [male] },
        { areaCode: 'E92000001', observations: [female] },
      ]),
    ).toEqual([female]);
  });

  it('reads every area shown when England has no value', () => {
    expect(
      sexObservations([
        { areaCode: 'E12000001', observations: [female] },
        { areaCode: 'E12000002', observations: [male] },
        { areaCode: 'E92000001', observations: [] },
      ]),
    ).toEqual([female, male]);
  });

  it('reads only the observations of the period type shown', () => {
    const rollingMale = { ...male, fromDate: '2022-01-01' };
    const data = [{ areaCode: 'E92000001', observations: [observation(5), rollingMale] }];
    expect(sexObservations(data, '1-year')).toEqual([observation(5)]);
    expect(sexObservations(data, '3-year')).toEqual([rollingMale]);
  });

  it('reads every area shown when England has none of the period type shown', () => {
    const rolling = (value: number, dimensions = [sex('Male')]) => ({
      ...observation(value, dimensions),
      fromDate: '2022-01-01',
    });
    const oxford = [rolling(3, []), rolling(4)];
    expect(
      sexObservations(
        [
          { areaCode: 'E07000178', observations: oxford },
          { areaCode: 'E92000001', observations: [observation(5), male] },
        ],
        '3-year',
      ),
    ).toEqual(oxford);
  });
});
