import { z } from '@fphd/config/zod';
import { INDICATOR_CALCULATED_BY } from '@fphd/utils/calculated-by';
import { standardCalculationMethodOf } from '@fphd/utils/standard-methods';

import {
  type IndicatorSection,
  indicatorSectionAnswersSchema,
  indicatorSectionResponseSchema,
  textSection,
} from './indicator-section-contract.ts';
import { longText } from './text-contract.ts';

const fields = z.enum(['standardMethodUsed', 'methodology', 'calculatedBy', 'calculatedByDetail']);

const SELECT_STANDARD_METHOD_USED =
  'Select whether the described standard method was used for this indicator';
const ENTER_METHODOLOGY = 'Enter the methodology';

const calculatedBySchema = z.enum(INDICATOR_CALCULATED_BY, {
  error: 'Select who calculated the indicator',
});

/**
 * What the form can judge without the draft's value type. Whether the standard method question
 * and the methodology are required depends on the value type, which `calculationSectionFor`
 * judges.
 */
const schema = z
  .object({
    standardMethodUsed: z.enum(['', 'yes', 'no'], { error: SELECT_STANDARD_METHOD_USED }),
    methodology: longText('Methodology'),
    calculatedBy: calculatedBySchema,
    calculatedByDetail: longText('Details of the other organisation or organisations'),
  })
  .superRefine(
    ({ standardMethodUsed, methodology, calculatedBy, calculatedByDetail }, ctx) => {
      if (standardMethodUsed === 'no' && methodology === '') {
        ctx.addIssue({ code: 'custom', path: ['methodology'], message: ENTER_METHODOLOGY });
      }
      // The organisation is asked for only under "Other", so only then is it required.
      if (calculatedBy === 'other' && calculatedByDetail === '') {
        ctx.addIssue({
          code: 'custom',
          path: ['calculatedByDetail'],
          message: 'Enter the organisation name',
        });
      }
    },
    // So every refusal shows at once, not the missing details only once the rest are answered.
    { when: ({ value }) => typeof value === 'object' && value !== null },
  );

export type CalculationField = z.infer<typeof fields>;
export type Calculation = z.infer<typeof schema>;

export const calculationSection: IndicatorSection<CalculationField, Calculation> = textSection({
  key: 'calculation',
  fields,
  schema,
});

/** The draft's value type, which decides what the page asks about the method. */
export const calculationValueTypeSchema = z.object({ id: z.uuid(), name: z.string().min(1) });

export type CalculationValueType = z.infer<typeof calculationValueTypeSchema>;

/** The section's answers, their version, and the draft's value type, null until one is chosen. */
export const calculationResponseSchema = indicatorSectionResponseSchema(
  indicatorSectionAnswersSchema(fields),
).extend({ valueType: calculationValueTypeSchema.nullable() });

/** The answers a value type asks for beyond the form's own rules, and the message for each missing. */
function missingMethodAnswers(
  { standardMethodUsed, methodology }: Calculation,
  valueTypeId: string,
): Partial<Record<CalculationField, string>> {
  if (standardCalculationMethodOf(valueTypeId) === null) {
    return methodology === '' ? { methodology: ENTER_METHODOLOGY } : {};
  }
  return standardMethodUsed === '' ? { standardMethodUsed: SELECT_STANDARD_METHOD_USED } : {};
}

/**
 * The section once the draft's value type is known. A value type with a standard method asks
 * whether it was used, and for the methodology under No. One with none, such as Score, asks for
 * the methodology alone. Before a value type is chosen, neither is asked, and only who calculated
 * the indicator is kept. Answers the page did not ask are dropped, whatever the form sent.
 */
export function calculationSectionFor(
  valueTypeId: string | null,
): IndicatorSection<CalculationField, Calculation> {
  return {
    ...calculationSection,
    schema: schema
      .superRefine(
        (answers, ctx) => {
          if (valueTypeId === null) return;

          for (const [field, message] of Object.entries(
            missingMethodAnswers(answers, valueTypeId),
          )) {
            ctx.addIssue({ code: 'custom', path: [field], message });
          }
        },
        { when: ({ value }) => typeof value === 'object' && value !== null },
      )
      .transform((answers) => {
        if (valueTypeId === null) return { ...answers, standardMethodUsed: '', methodology: '' };
        if (standardCalculationMethodOf(valueTypeId) === null) {
          return { ...answers, standardMethodUsed: '' };
        }
        return answers;
      }),
  };
}
