import { describe, expect, it } from 'vitest';

import {
  type SexAndAgesFormValues,
  sexAndAgesSection as section,
} from './indicator-sex-and-ages-contract.ts';
import { sectionFieldErrors } from './testing.ts';

const form: SexAndAgesFormValues = {
  demographics: ['sex'],
  sexes: ['persons'],
  genders: [],
  ethnicGroups: [],
};

describe('sexAndAgesSection', () => {
  it('takes each group of boxes once each, in the order the page lists them', () => {
    const parsed = section.schema.parse({
      ...form,
      demographics: ['ethnicity', 'sex', 'gender', 'sex'],
      sexes: ['males', 'persons', 'males'],
      genders: ['prefer-not-to-say', 'non-binary', 'persons'],
      ethnicGroups: ['other', 'asian'],
    });

    expect(parsed).toEqual({
      demographics: ['sex', 'gender', 'ethnicity'],
      sexes: ['persons', 'males'],
      genders: ['persons', 'non-binary', 'prefer-not-to-say'],
      ethnicGroups: ['asian', 'other'],
    });
  });

  it.each([
    ['sex', { sexes: ['females'] }],
    ['gender', { genders: ['women-and-girls'] }],
    ['ethnicity', { ethnicGroups: ['white'] }],
  ])('accepts %s alone with its own list', (demographic, given) => {
    expect(
      sectionFieldErrors(section, {
        ...form,
        demographics: [demographic],
        sexes: [],
        ...given,
      }),
    ).toBeUndefined();
  });

  it('asks nothing of the lists of demographics not collected', () => {
    expect(
      sectionFieldErrors(section, {
        ...form,
        demographics: ['gender'],
        sexes: [],
        genders: ['other'],
        ethnicGroups: [],
      }),
    ).toBeUndefined();
  });

  it('refuses a collected demographic with none of its list ticked', () => {
    expect(
      sectionFieldErrors(section, {
        ...form,
        demographics: ['sex', 'gender', 'ethnicity'],
        sexes: [],
      }),
    ).toEqual({
      sexes: 'Select the sexes included',
      genders: 'Select the genders included',
      ethnicGroups: 'Select the ethnic groups included',
    });
  });

  it('refuses an empty list beside a refused list of another demographic', () => {
    expect(
      sectionFieldErrors(section, {
        ...form,
        demographics: ['gender'],
        sexes: [],
        ethnicGroups: ['irish'],
      }),
    ).toEqual({
      genders: 'Select the genders included',
      ethnicGroups: 'Select the ethnic groups included',
    });
  });

  it("refuses a collected list that was not sent with the list's own message", () => {
    const { genders: _, ...withoutGenders } = { ...form, demographics: ['gender'] };

    expect(sectionFieldErrors(section, withoutGenders)).toEqual({
      genders: 'Select the genders included',
    });
  });

  it('refuses an empty form', () => {
    expect(sectionFieldErrors(section, { ...form, demographics: [], sexes: [] })).toEqual({
      demographics: 'Select what was collected for this indicator',
    });
  });

  it.each([
    [{ demographics: ['age'] }, { demographics: 'Select what was collected for this indicator' }],
    [{ demographics: 'sex' }, { demographics: 'Select what was collected for this indicator' }],
    [{ sexes: ['everyone'] }, { sexes: 'Select the sexes included' }],
    [{ sexes: ['persons', 'everyone'] }, { sexes: 'Select the sexes included' }],
    [{ sexes: 'persons' }, { sexes: 'Select the sexes included' }],
    [{ demographics: ['gender'], genders: ['women'] }, { genders: 'Select the genders included' }],
    [
      { demographics: ['ethnicity'], ethnicGroups: ['asian', 'irish'] },
      { ethnicGroups: 'Select the ethnic groups included' },
    ],
  ])('refuses %o', (answers, fieldErrors) => {
    expect(sectionFieldErrors(section, { ...form, ...answers })).toEqual(fieldErrors);
  });

  it('accepts what it gave, so the API can apply it again', () => {
    const parsed = section.schema.parse({
      ...form,
      demographics: ['gender', 'sex'],
      sexes: ['males', 'persons'],
      genders: ['other'],
    });

    expect(section.schema.parse(parsed)).toEqual(parsed);
  });
});

describe('sexAndAgesSection.formValues', () => {
  it('gives the stored lists to the form', () => {
    expect(
      section.formValues({
        demographics: ['sex', 'ethnicity'],
        sexes: ['females'],
        genders: [],
        ethnicGroups: ['black'],
      }),
    ).toEqual({
      demographics: ['sex', 'ethnicity'],
      sexes: ['females'],
      genders: [],
      ethnicGroups: ['black'],
    });
  });
});
