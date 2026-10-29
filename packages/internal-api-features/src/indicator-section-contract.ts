import { z } from '@fphd/config/zod';

import type { IndicatorTaskKey } from './contract.ts';
import { editVersionedSchema, editVersionSchema } from './edit-version-contract.ts';

/** A section's field names, in the order its page asks them. */
export type IndicatorSectionFields<Field extends string> = z.ZodEnum<{ [K in Field]: K }>;

/**
 * One section of a draft, as its page and its endpoint both see it. The key names the task,
 * the page (`/publish/indicators/:id/<key>`) and the endpoint
 * (`/api/internal/indicators/:id/<key>`). The schema takes the answers as the form holds
 * them, which is its text unless the section says otherwise, and is applied at the form and
 * again at the API. The draft holds the answers as the endpoint gives them, each field's text
 * or null unless the section says otherwise.
 */
export interface IndicatorSection<
  Field extends string,
  Values,
  Input = Record<Field, string>,
  ErrorField extends string = Field,
  Answers = Record<Field, string | null>,
> {
  key: IndicatorTaskKey;
  fields: IndicatorSectionFields<Field>;
  schema: z.ZodType<Values, Input>;
  /** What a refusal is keyed by, for a section that names its list items' fields as well. */
  errorFields?: z.ZodType<ErrorField, string>;
  /** The draft's answers as the form holds them. */
  formValues(answers: Answers): Input;
}

/** Whether the text is up to two digits, from min to max. */
export function isSmallNumber(text: string, min: number, max: number): boolean {
  return /^\d{1,2}$/.test(text) && Number(text) >= min && Number(text) <= max;
}

/** A yes or no radio answer, refused with `error` when it is neither. */
export function yesNoSchema(error: string) {
  return z.enum(['yes', 'no'], { error });
}

/**
 * A question whose yes asks for details, and the message when they are missing. A section
 * declares its list once, `as const`, for both its schema and its columns.
 */
export interface DetailedQuestion<Answer extends string, Detail extends string = Answer> {
  answer: Answer;
  detail: Detail;
  detailRequired: string;
}

/** Refuses each yes whose details are blank, also beside an unanswered question. */
export function requireDetails<Shape extends z.ZodRawShape>(
  schema: z.ZodObject<Shape>,
  questions: readonly DetailedQuestion<keyof Shape & string>[],
) {
  return schema.superRefine(
    (answers: Record<string, unknown>, ctx) => {
      for (const { answer, detail, detailRequired } of questions) {
        if (answers[answer] === 'yes' && answers[detail] === '') {
          ctx.addIssue({ code: 'custom', path: [detail], message: detailRequired });
        }
      }
    },
    // So every refusal shows at once, not the missing details only once the rest are answered.
    { when: ({ value }) => typeof value === 'object' && value !== null },
  );
}

/** A section's answers as the draft holds them: null until a field is answered. */
export function indicatorSectionAnswersSchema<Field extends string>(
  fields: IndicatorSectionFields<Field>,
): z.ZodType<Record<Field, string | null>> {
  return z.record(fields, z.string().nullable());
}

/** A section's answers, and their version, which a save of the form showing them sends back. */
export function indicatorSectionResponseSchema<Answers>(answers: z.ZodType<Answers>) {
  return z.object({ answers, version: editVersionSchema });
}

/** A save: the answers, which the section's schema reads, and the version the form was shown. */
export const indicatorSectionSaveSchema = editVersionedSchema.extend({ answers: z.unknown() });

/** Stored answers as the form's text, where an unanswered field is empty. */
export function indicatorSectionFormValues<Field extends string>(
  fields: IndicatorSectionFields<Field>,
  answers: Record<Field, string | null>,
): Record<Field, string> {
  return Object.fromEntries(fields.options.map((field) => [field, answers[field] ?? ''])) as Record<
    Field,
    string
  >;
}

/** A section whose answers are each field's text, or null until it is answered. */
export function textSection<Field extends string, Values>(
  section: Omit<IndicatorSection<Field, Values>, 'formValues'>,
): IndicatorSection<Field, Values> {
  return {
    ...section,
    formValues: (answers) => indicatorSectionFormValues(section.fields, answers),
  };
}

/** The keys a section's refusal names: its fields, or its own wider list. */
function errorFieldsOf<Field extends string, ErrorField extends string>(
  section: IndicatorSection<Field, unknown, unknown, ErrorField, never>,
): z.ZodType<Field | ErrorField, string> {
  return section.errorFields ?? section.fields;
}

/**
 * The 400 and 409 answers. A refused answer is always named; a bad id or version names no
 * field. A save of a section changed since its form was shown is refused as `changed`, with
 * the version it has now. A missing indicator or draft is a 404, which the client throws.
 */
export function indicatorSectionErrorSchema<Field extends string, ErrorField extends string>(
  section: IndicatorSection<Field, unknown, unknown, ErrorField, never>,
): z.ZodType<IndicatorSectionError<Field | ErrorField>> {
  return z.discriminatedUnion('error', [
    z.object({ error: z.literal('invalid_id') }),
    z.object({ error: z.literal('invalid_version') }),
    z.object({ error: z.literal('locked') }),
    z.object({ error: z.literal('changed'), version: editVersionSchema }),
    z.object({
      error: z.literal('validation_failed'),
      fieldErrors: z.partialRecord(errorFieldsOf(section), z.string()),
    }),
  ]);
}

type IndicatorSectionError<Field extends string> =
  | { error: 'invalid_id' }
  | { error: 'invalid_version' }
  | { error: 'locked' }
  | { error: 'changed'; version: string }
  | { error: 'validation_failed'; fieldErrors: Partial<Record<Field, string>> };

/** The names an issue may be shown under, most specific first: `list[0].part`, then `list`. */
function issueKeys([field, index, part]: readonly PropertyKey[]): string[] {
  if (typeof field !== 'string') return [];
  return typeof index === 'number' && typeof part === 'string'
    ? [`${field}[${index}].${part}`, field]
    : [field];
}

/**
 * One message per field: a control shows one error even when a value breaks two rules.
 * `fields` names the keys the form shows, so the caller gets those and nothing else — an
 * issue on anything the form does not show is dropped rather than sent as a field error.
 */
export function toFieldErrors<Field extends string>(
  error: z.ZodError,
  fields: z.ZodType<Field, string>,
): Partial<Record<Field, string>> {
  const fieldErrors: Partial<Record<Field, string>> = {};

  for (const issue of error.issues) {
    const field = issueKeys(issue.path)
      .map((key) => fields.safeParse(key).data)
      .find((key) => key !== undefined);

    if (field !== undefined && !Object.hasOwn(fieldErrors, field)) {
      fieldErrors[field] = issue.message;
    }
  }

  return fieldErrors;
}

/** A refusal of the section's schema, keyed as its page names its fields. */
export function indicatorSectionFieldErrors<Field extends string, ErrorField extends string>(
  section: IndicatorSection<Field, unknown, unknown, ErrorField, never>,
  error: z.ZodError,
): Partial<Record<Field | ErrorField, string>> {
  return toFieldErrors(error, errorFieldsOf(section));
}
