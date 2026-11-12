import { describe, expect, it } from 'vitest';

import { readSexAndAgesForm } from './form.ts';

function formData(fields: [string, string][]): FormData {
  const data = new FormData();
  for (const [name, value] of fields) data.append(name, value);
  return data;
}

describe('readSexAndAgesForm', () => {
  it('reads every box ticked', () => {
    expect(
      readSexAndAgesForm(
        formData([
          ['demographics', 'sex'],
          ['demographics', 'ethnicity'],
          ['sexes', 'females'],
          ['sexes', 'males'],
          ['genders', 'other'],
          ['ethnicGroups', 'white'],
        ]),
      ),
    ).toEqual({
      demographics: ['sex', 'ethnicity'],
      sexes: ['females', 'males'],
      genders: ['other'],
      ethnicGroups: ['white'],
    });
  });

  it('reads groups the browser did not send, with no boxes ticked, as empty', () => {
    expect(readSexAndAgesForm(new FormData())).toEqual({
      demographics: [],
      sexes: [],
      genders: [],
      ethnicGroups: [],
    });
  });
});
