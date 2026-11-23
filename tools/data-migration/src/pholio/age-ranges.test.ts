import { describe, expect, it } from 'vitest';

import { ageRanges, type DimensionValueInput } from './age-ranges.ts';

describe('ageRanges', () => {
  const age = { id: 'age', name: 'Age' };
  const sex = { id: 'sex', name: 'Sex' };
  const value = (
    id: string,
    dimensionTypeId: string,
    code: string | null,
    isAggregate = false,
  ): DimensionValueInput => ({ id, dimensionTypeId, code, isAggregate });

  it('gives age bands HL7 ranges, with no upper limit for a band ending at 150', () => {
    const result = ageRanges(
      [age, sex],
      [
        value('all', 'age', '1', true),
        value('under5', 'age', '28'),
        value('over65', 'age', '27'),
        value('neonatal', 'age', '23'),
        value('review', 'age', '241'),
        value('school', 'age', '217'),
        value('male', 'sex', '1'),
      ],
      new Map([
        ['1', { min: 0, max: 150 }],
        ['28', { min: 0, max: 4 }],
        ['27', { min: 65, max: 150 }],
      ]),
    );

    expect(
      result.map((v) => [v.id, v.ageFromValue, v.ageFromUnit, v.ageUnderValue, v.ageUnderUnit]),
    ).toEqual([
      ['under5', 0, 'year', 5, 'year'],
      ['over65', 65, 'year', null, null],
      ['neonatal', 0, 'day', 28, 'day'],
      ['review', 2, 'year', 30, 'month'],
    ]);
  });
});
