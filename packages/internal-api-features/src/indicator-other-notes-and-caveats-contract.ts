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
  'hasRounding',
  'roundingDetail',
  'hasCaveats',
  'caveatsDetail',
  'hasOtherNotes',
  'otherNotesDetail',
]);

export type OtherNotesAndCaveatsField = z.infer<typeof fields>;

/** The yes/no questions whose yes asks for details. */
export const otherNotesAndCaveatsQuestions = [
  {
    answer: 'hasRounding',
    detail: 'roundingDetail',
    detailRequired: 'Provide details of the rounding',
  },
  {
    answer: 'hasCaveats',
    detail: 'caveatsDetail',
    detailRequired: 'Provide details of the caveats',
  },
  {
    answer: 'hasOtherNotes',
    detail: 'otherNotesDetail',
    detailRequired: 'Provide details of the other notes',
  },
] as const satisfies readonly DetailedQuestion<OtherNotesAndCaveatsField>[];

const schema = requireDetails(
  z.object({
    hasRounding: yesNoSchema('Select whether rounding has been applied'),
    roundingDetail: longText('Details of the rounding'),
    hasCaveats: yesNoSchema('Select whether there are any caveats needed'),
    caveatsDetail: longText('Details of the caveats'),
    hasOtherNotes: yesNoSchema('Select whether there are any other notes needed'),
    otherNotesDetail: longText('Details of the other notes'),
  }),
  otherNotesAndCaveatsQuestions,
);

export type OtherNotesAndCaveats = z.infer<typeof schema>;

export const otherNotesAndCaveatsSection: IndicatorSection<
  OtherNotesAndCaveatsField,
  OtherNotesAndCaveats
> = textSection({ key: 'other-notes-and-caveats', fields, schema });
