import { z } from '@fphd/config/zod';
import {
  hasUpdateFrequencyReason,
  UPDATE_FREQUENCIES,
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

const fields = z.enum(['updateFrequency', 'noFixedFrequencyReason', 'noLongerUpdatedReason']);

// Each reason is asked for only under its own answer, so only then is it required.
const schema = z
  .object({
    updateFrequency: z.enum(UPDATE_FREQUENCIES, {
      error: 'Select how often this indicator will be updated',
    }),
    noFixedFrequencyReason: longText('Reason for having no fixed update frequency'),
    noLongerUpdatedReason: longText('Reason for no longer updating this indicator'),
  })
  .superRefine(({ updateFrequency, ...reasons }, ctx) => {
    if (!hasUpdateFrequencyReason(updateFrequency)) return;
    const field = UPDATE_FREQUENCY_REASON_FIELDS[updateFrequency];

    if (reasons[field] === '') {
      ctx.addIssue({ code: 'custom', path: [field], message: REASON_REQUIRED[updateFrequency] });
    }
  });

export type UpdateFrequencyField = z.infer<typeof fields>;
export type IndicatorUpdateFrequency = z.infer<typeof schema>;

export const updateFrequencySection: IndicatorSection<
  UpdateFrequencyField,
  IndicatorUpdateFrequency
> = textSection({ key: 'update-frequency', fields, schema });
