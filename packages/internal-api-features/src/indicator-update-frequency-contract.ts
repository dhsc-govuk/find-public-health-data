import { z } from '@fphd/config/zod';
import {
  hasUpdateFrequencyReason,
  UPDATE_FREQUENCIES,
  UPDATE_FREQUENCY_MAX_YEARS,
  UPDATE_FREQUENCY_MIN_YEARS,
  type UpdateFrequencyWithReason,
} from '@fphd/utils/update-frequency';

import { type IndicatorSection, textSection } from './indicator-section-contract.ts';
import { longText } from './text-contract.ts';

/**
 * "No fixed frequency" and "This indicator will no longer be updated" each reveal a box for the
 * reason, so the form has a field for each. The draft keeps one reason, for the chosen answer.
 */
export const UPDATE_FREQUENCY_REASON_FIELDS = {
  'no-fixed-frequency': 'noFixedFrequencyReason',
  'no-longer-updated': 'noLongerUpdatedReason',
} as const satisfies Record<UpdateFrequencyWithReason, string>;

const REASON_REQUIRED: Readonly<Record<UpdateFrequencyWithReason, string>> = {
  'no-fixed-frequency': 'Enter the reason this indicator has no fixed update frequency',
  'no-longer-updated': 'Enter the reason this indicator will no longer be updated',
};

const fields = z.enum([
  'updateFrequency',
  'updateFrequencyYears',
  'updateFrequencyText',
  'noFixedFrequencyReason',
  'noLongerUpdatedReason',
]);

/** The problem with the number of years typed under "Frequency of more than 1 year", if any. */
function yearsProblem(years: string): string | undefined {
  if (years === '') return 'Enter the number of years between updates';
  if (!/^\d+$/.test(years) || Number(years) < UPDATE_FREQUENCY_MIN_YEARS) {
    return `Number of years must be a whole number of ${UPDATE_FREQUENCY_MIN_YEARS} or more`;
  }
  if (Number(years) > UPDATE_FREQUENCY_MAX_YEARS) {
    return `Number of years must be ${UPDATE_FREQUENCY_MAX_YEARS} or fewer`;
  }
  return undefined;
}

// The years, the description and each reason are asked for only under their own answer, so only
// then are they required.
const schema = z
  .object({
    updateFrequency: z.enum(UPDATE_FREQUENCIES, {
      error: 'Select how often this indicator will be updated',
    }),
    updateFrequencyYears: z.string().trim(),
    updateFrequencyText: longText('Description of how often this indicator will be updated'),
    noFixedFrequencyReason: longText('Reason for having no fixed update frequency'),
    noLongerUpdatedReason: longText('Reason for no longer updating this indicator'),
  })
  .superRefine(
    ({ updateFrequency, updateFrequencyYears, updateFrequencyText, ...reasons }, ctx) => {
      if (updateFrequency === 'every-n-years') {
        const message = yearsProblem(updateFrequencyYears);
        if (message) ctx.addIssue({ code: 'custom', path: ['updateFrequencyYears'], message });
      }
      if (updateFrequency === 'other' && updateFrequencyText === '') {
        ctx.addIssue({
          code: 'custom',
          path: ['updateFrequencyText'],
          message: 'Enter how often this indicator will be updated',
        });
      }
      if (!hasUpdateFrequencyReason(updateFrequency)) return;
      const field = UPDATE_FREQUENCY_REASON_FIELDS[updateFrequency];

      if (reasons[field] === '') {
        ctx.addIssue({ code: 'custom', path: [field], message: REASON_REQUIRED[updateFrequency] });
      }
    },
  );

export type UpdateFrequencyField = z.infer<typeof fields>;
export type IndicatorUpdateFrequency = z.infer<typeof schema>;

export const updateFrequencySection: IndicatorSection<
  UpdateFrequencyField,
  IndicatorUpdateFrequency
> = textSection({ key: 'update-frequency', fields, schema });
