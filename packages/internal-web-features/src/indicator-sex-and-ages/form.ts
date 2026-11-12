import {
  AGE_RANGE_PARTS,
  type AgeRangeFormValues,
  ageRangeFieldName,
  MAX_AGE_RANGES,
  type SexAndAgesFormValues,
  type SexAndAgesPageField,
} from '@fphd/internal-api-features/contract';

import { readFormValues } from '../form-values.ts';
import type { FormFailure } from '../indicator-section.ts';
import { type ListIntent, readListIntent, readListItems } from '../list-form.ts';

/** The page as the action re-renders it: after a refusal, or with a range added or removed. */
export type SexAndAgesPageState = FormFailure<SexAndAgesPageField, SexAndAgesFormValues>;

const BLANK_AGE_RANGE: AgeRangeFormValues = {
  lowerLimit: '',
  lowerLimitUnit: '',
  upperLimit: '',
  upperLimitUnit: '',
};

/** The answers with a blank range if they hold none, as the page always offers one. */
export function withAgeRangeShown(values: SexAndAgesFormValues): SexAndAgesFormValues {
  return values.ageRanges.length > 0 ? values : { ...values, ageRanges: [BLANK_AGE_RANGE] };
}

/** The boxes ticked in the group called `name`. */
function ticked(formData: FormData, name: string): string[] {
  return formData.getAll(name).filter((value) => typeof value === 'string');
}

/** The form as sent, and which of its buttons sent it; a field not sent is empty. */
export function readSexAndAgesForm(formData: FormData): {
  values: SexAndAgesFormValues;
  intent: ListIntent;
} {
  return {
    values: {
      ...readFormValues(formData, ['ageType', 'specificAge', 'specificAgeUnit', 'ageDetail']),
      demographics: ticked(formData, 'demographics'),
      sexes: ticked(formData, 'sexes'),
      genders: ticked(formData, 'genders'),
      ethnicGroups: ticked(formData, 'ethnicGroups'),
      ageRanges: readListItems(formData, AGE_RANGE_PARTS, ageRangeFieldName),
    },
    intent: readListIntent(formData),
  };
}

/**
 * The page with a blank range after the others, up to as many as a draft may hold. Adding a
 * range answers "Age range", which a form without JavaScript may not have chosen.
 */
export function withAgeRangeAdded(values: SexAndAgesFormValues): SexAndAgesPageState {
  const ageRanges =
    values.ageRanges.length < MAX_AGE_RANGES
      ? [...values.ageRanges, BLANK_AGE_RANGE]
      : values.ageRanges;

  return { values: { ...values, ageType: 'range', ageRanges }, fieldErrors: {} };
}

/** The page without the range at `index`, keeping everything typed elsewhere. */
export function withAgeRangeRemoved(
  values: SexAndAgesFormValues,
  index: number,
): SexAndAgesPageState {
  const ageRanges = values.ageRanges.filter((_, at) => at !== index);

  return { values: withAgeRangeShown({ ...values, ageRanges }), fieldErrors: {} };
}
