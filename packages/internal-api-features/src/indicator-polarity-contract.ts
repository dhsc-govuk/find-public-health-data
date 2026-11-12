import { z } from '@fphd/config/zod';
import { POLARITIES } from '@fphd/utils/polarity';

import { type IndicatorSection, textSection } from './indicator-section-contract.ts';

const fields = z.enum(['polarity']);

const schema = z.object({
  polarity: z.enum(POLARITIES, { error: 'Select the polarity of this indicator' }),
});

export type PolarityField = z.infer<typeof fields>;
export type IndicatorPolarity = z.infer<typeof schema>;

export const polaritySection: IndicatorSection<PolarityField, IndicatorPolarity> = textSection({
  key: 'polarity',
  fields,
  schema,
});
