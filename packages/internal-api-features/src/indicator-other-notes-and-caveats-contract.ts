import { z } from '@fphd/config/zod';

import {
  type DetailedQuestion,
  type IndicatorSection,
  requireDetails,
  textSection,
  yesNoSchema,
} from './indicator-section-contract.ts';
import { longText } from './text-contract.ts';

const fields = z.enum([
  'hasDataQualityIssues',
  'hasCaveats',
  'caveatsDetail',
  'hasOtherNotes',
  'otherNotesDetail',
]);

export type OtherNotesAndCaveatsField = z.infer<typeof fields>;

/** The yes/no questions whose yes asks for details. */
const otherNotesAndCaveatsQuestions = [
  {
    answer: 'hasCaveats',
    detail: 'caveatsDetail',
    detailRequired: 'Provide details of the caveats',
  },
  {
    answer: 'hasOtherNotes',
    detail: 'otherNotesDetail',
    detailRequired: 'Provide details of the additional interpretation notes',
  },
] as const satisfies readonly DetailedQuestion<OtherNotesAndCaveatsField>[];

const schema = requireDetails(
  z.object({
    hasDataQualityIssues: yesNoSchema(
      'Select whether there are any data quality issues with this indicator',
    ),
    hasCaveats: yesNoSchema('Select whether there are any caveats needed'),
    caveatsDetail: longText('Details of the caveats'),
    hasOtherNotes: yesNoSchema(
      'Select whether there are any additional interpretation notes needed',
    ),
    otherNotesDetail: longText('Details of the additional interpretation notes'),
  }),
  otherNotesAndCaveatsQuestions,
).superRefine(
  ({ hasDataQualityIssues, hasCaveats }, ctx) => {
    if (hasDataQualityIssues === 'yes' && hasCaveats === 'no') {
      ctx.addIssue({
        code: 'custom',
        path: ['hasCaveats'],
        message:
          "If there are data quality issues, you need to explain these in the 'Caveats' section",
      });
    }
  },
  // Refused with the other answers, not only once they are all given.
  { when: ({ value }) => typeof value === 'object' && value !== null },
);

export type OtherNotesAndCaveats = z.infer<typeof schema>;

export const otherNotesAndCaveatsSection: IndicatorSection<
  OtherNotesAndCaveatsField,
  OtherNotesAndCaveats
> = textSection({ key: 'other-notes-and-caveats', fields, schema });
