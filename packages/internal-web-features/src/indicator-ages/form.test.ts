import {
  type AgeRangeFormValues,
  type AgesFormValues,
  ageRangeFieldName,
  MAX_AGE_RANGES,
} from '@fphd/internal-api-features/contract';
import { describe, expect, it } from 'vitest';

import { removeIntent } from '../list-form.ts';
import { readAgesForm, withAgeRangeAdded, withAgeRangeRemoved, withAgeRangeShown } from './form.ts';

const blank: AgeRangeFormValues = {
  lowerLimit: '',
  lowerLimitUnit: '',
  upperLimit: '',
  upperLimitUnit: '',
};
const sixteenPlus = { ...blank, lowerLimit: '16', lowerLimitUnit: 'years' };
const underFive = { ...blank, upperLimit: '4', upperLimitUnit: 'years' };

const empty: AgesFormValues = {
  ageType: '',
  ageRanges: [],
  specificAge: '',
  specificAgeUnit: '',
  ageDetail: '',
};

function formData(fields: [string, string][], ranges: AgeRangeFormValues[] = []): FormData {
  const data = new FormData();
  for (const [name, value] of fields) data.append(name, value);
  ranges.forEach((range, index) => {
    for (const [part, value] of Object.entries(range)) {
      data.append(ageRangeFieldName(index, part as keyof AgeRangeFormValues), value);
    }
  });
  return data;
}

describe('readAgesForm', () => {
  it('reads the ranges in order and the other fields as typed', () => {
    const { values } = readAgesForm(
      formData(
        [
          ['ageType', 'range'],
          ['specificAge', ' 5 '],
          ['specificAgeUnit', 'weeks'],
          ['ageDetail', 'Year 6'],
        ],
        [sixteenPlus, underFive],
      ),
    );

    expect(values).toEqual({
      ageType: 'range',
      ageRanges: [sixteenPlus, underFive],
      specificAge: ' 5 ',
      specificAgeUnit: 'weeks',
      ageDetail: 'Year 6',
    });
  });

  it('reads fields the browser did not send as empty', () => {
    expect(readAgesForm(new FormData()).values).toEqual(empty);
  });

  it('reads which button sent the form', () => {
    expect(readAgesForm(formData([['intent', removeIntent(2)]])).intent).toEqual({
      to: 'remove',
      index: 2,
    });
  });
});

describe('withAgeRangeShown', () => {
  it('offers a blank range when there is none', () => {
    expect(withAgeRangeShown(empty).ageRanges).toEqual([blank]);
  });

  it('leaves the ranges alone when there are some', () => {
    expect(withAgeRangeShown({ ...empty, ageRanges: [sixteenPlus] }).ageRanges).toEqual([
      sixteenPlus,
    ]);
  });
});

describe('withAgeRangeAdded', () => {
  it('adds a blank range after the others, choosing "Age range"', () => {
    expect(withAgeRangeAdded({ ...empty, ageRanges: [sixteenPlus] })).toEqual({
      values: { ...empty, ageType: 'range', ageRanges: [sixteenPlus, blank] },
      fieldErrors: {},
    });
  });

  it('adds none beyond as many as a draft may hold', () => {
    const full = Array.from({ length: MAX_AGE_RANGES }, () => sixteenPlus);

    expect(withAgeRangeAdded({ ...empty, ageRanges: full }).values.ageRanges).toHaveLength(
      MAX_AGE_RANGES,
    );
  });
});

describe('withAgeRangeRemoved', () => {
  it('removes the range at the index, keeping the rest as typed', () => {
    const values = { ...empty, ageType: 'range', ageRanges: [sixteenPlus, blank, underFive] };

    expect(withAgeRangeRemoved(values, 1)).toEqual({
      values: { ...values, ageRanges: [sixteenPlus, underFive] },
      fieldErrors: {},
    });
  });

  it('leaves a blank range when the last one goes', () => {
    expect(withAgeRangeRemoved({ ...empty, ageRanges: [sixteenPlus] }, 0).values.ageRanges).toEqual(
      [blank],
    );
  });
});
