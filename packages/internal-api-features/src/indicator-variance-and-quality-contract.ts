import { z } from '@fphd/config/zod';

import { type IndicatorSection, textSection } from './indicator-section-contract.ts';
import { longText } from './text-contract.ts';

const fields = z.enum(['variation', 'qualityAssurance', 'sourceDataIssuesDetail']);

export type VarianceAndQualityField = z.infer<typeof fields>;

const schema = z.object({
  variation: longText('Variation').min(1, 'Enter how the indicator varies'),
  qualityAssurance: longText('Quality assurance').min(
    1,
    'Enter what quality assurance has been done on the indicator',
  ),
  // The improvement notes are optional, because only an indicator with data quality issues
  // has any to describe.
  sourceDataIssuesDetail: longText('Data quality improvement notes'),
});

export type VarianceAndQuality = z.infer<typeof schema>;

/** Notes for reviewers on how the indicator varies and how its quality was checked. */
export const varianceAndQualitySection: IndicatorSection<
  VarianceAndQualityField,
  VarianceAndQuality
> = textSection({ key: 'variance-and-quality', fields, schema });
