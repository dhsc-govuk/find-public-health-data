import { z } from '@fphd/config/zod';
import { AGE_TYPES, AGE_UNIT_DAYS, AGE_UNITS, type AgeUnit, MAX_AGE } from '@fphd/utils/ages';

import type { IndicatorSection } from './indicator-section-contract.ts';
import { shortText } from './text-contract.ts';

export const MAX_AGE_RANGES = 20;

const fields = z.enum(['ageType', 'ageRanges', 'specificAge', 'specificAgeUnit', 'ageDetail']);

export type AgesField = z.infer<typeof fields>;

/** One age range as the form holds it: each limit and its unit as text. */
export interface AgeRangeFormValues {
  lowerLimit: string;
  lowerLimitUnit: string;
  upperLimit: string;
  upperLimitUnit: string;
}

export type AgeRangePart = keyof AgeRangeFormValues;

/** The answers as the form holds them, as text. */
export interface AgesFormValues {
  ageType: string;
  ageRanges: AgeRangeFormValues[];
  specificAge: string;
  specificAgeUnit: string;
  ageDetail: string;
}

/** A field of one range, named as its control is and as its refusal is keyed. */
export type AgeRangeField = `ageRanges[${number}].${AgeRangePart}`;

export function ageRangeFieldName(index: number, part: AgeRangePart): AgeRangeField {
  return `ageRanges[${index}].${part}`;
}

const WHOLE_NUMBER = /^\d+$/;

function isAge(value: string): boolean {
  return WHOLE_NUMBER.test(value) && Number(value) <= MAX_AGE;
}

/** The messages for each way an age and its unit can be refused. */
interface AgeMessages {
  enter: string;
  wholeNumber: string;
  select: string;
}

/** Why an age and its unit are refused, keyed by the field at fault. */
function ageProblems<ValueField extends string, UnitField extends string>(
  [valueField, unitField]: readonly [ValueField, UnitField],
  value: string,
  unit: AgeUnit | '',
  { enter, wholeNumber, select }: AgeMessages,
): Partial<Record<ValueField | UnitField, string>> {
  const problems: Partial<Record<ValueField | UnitField, string>> = {};

  if (value === '') problems[valueField] = enter;
  else if (!isAge(value)) problems[valueField] = wholeNumber;
  if (unit === '') problems[unitField] = select;

  return problems;
}

export type AgeLimitBound = 'lower' | 'upper';

/** The two fields of each limit of a range: its value and its unit. */
export const AGE_LIMIT_FIELDS = {
  lower: ['lowerLimit', 'lowerLimitUnit'],
  upper: ['upperLimit', 'upperLimitUnit'],
} as const satisfies Record<AgeLimitBound, readonly [AgeRangePart, AgeRangePart]>;

/** A limit's label: "Lower limit" in the first range, and numbered from the second. */
export function ageLimitLabel(bound: AgeLimitBound, index: number): string {
  const label = bound === 'lower' ? 'Lower limit' : 'Upper limit';
  return index === 0 ? label : `${label} ${index + 1}`;
}

function limitName(bound: AgeLimitBound, index: number): string {
  return index === 0 ? `the ${bound} limit` : `${bound} limit ${index + 1}`;
}

function selectLimitUnit(bound: AgeLimitBound, index: number): string {
  return `Select the periods for ${limitName(bound, index)}`;
}

const SELECT_AGE_UNIT = 'Select the periods';

const ageUnit = z.enum(['', ...AGE_UNITS], { error: SELECT_AGE_UNIT });

/** A limit's unit, refused by the limit's own name, as the empty unit is. */
function limitUnit(bound: AgeLimitBound) {
  return z.enum(['', ...AGE_UNITS], {
    error: ({ path }) => selectLimitUnit(bound, typeof path?.[1] === 'number' ? path[1] : 0),
  });
}

const ageRange = z.object({
  lowerLimit: z.string().trim(),
  lowerLimitUnit: limitUnit('lower'),
  upperLimit: z.string().trim(),
  upperLimitUnit: limitUnit('upper'),
});

type AgeRange = z.infer<typeof ageRange>;

/** Why one limit of a range is refused; one left wholly empty is fine beside the other. */
function limitProblems(
  range: AgeRange,
  bound: AgeLimitBound,
  index: number,
): Partial<Record<AgeRangePart, string>> {
  const [valueField, unitField] = AGE_LIMIT_FIELDS[bound];
  const value = range[valueField];
  const unit = range[unitField];

  if (value === '' && unit === '') return {};

  return ageProblems(AGE_LIMIT_FIELDS[bound], value, unit, {
    enter: `Enter ${limitName(bound, index)}`,
    wholeNumber: `${ageLimitLabel(bound, index)} must be a whole number from 0 to ${MAX_AGE}`,
    select: selectLimitUnit(bound, index),
  });
}

function inDays(value: string, unit: AgeUnit): number {
  return Number(value) * AGE_UNIT_DAYS[unit];
}

/** Why one range is refused, keyed by the part at fault. */
function ageRangeProblems(range: AgeRange, index: number): Partial<Record<AgeRangePart, string>> {
  const { lowerLimit, lowerLimitUnit, upperLimit, upperLimitUnit } = range;

  if (lowerLimit === '' && lowerLimitUnit === '' && upperLimit === '' && upperLimitUnit === '') {
    return {
      lowerLimit:
        index === 0
          ? 'You must enter at least a lower or upper limit'
          : `You must enter at least a lower or upper limit for range ${index + 1}`,
    };
  }

  const problems = {
    ...limitProblems(range, 'lower', index),
    ...limitProblems(range, 'upper', index),
  };

  if (
    Object.keys(problems).length === 0 &&
    lowerLimitUnit !== '' &&
    upperLimitUnit !== '' &&
    inDays(upperLimit, upperLimitUnit) < inDays(lowerLimit, lowerLimitUnit)
  ) {
    return {
      upperLimit: `${ageLimitLabel('upper', index)} must not be lower than ${limitName('lower', index)}`,
    };
  }

  return problems;
}

const schema = z
  .object({
    ageType: z.enum(AGE_TYPES, { error: 'Select the age type' }),
    ageRanges: z
      .array(ageRange)
      .max(MAX_AGE_RANGES, `You cannot add more than ${MAX_AGE_RANGES} ranges`),
    specificAge: z.string().trim(),
    specificAgeUnit: ageUnit,
    ageDetail: shortText('Ages included'),
  })
  .superRefine(
    ({ ageType, ageRanges, specificAge, specificAgeUnit, ageDetail }, ctx) => {
      const issue = (path: (string | number)[], message: string) =>
        ctx.addIssue({ code: 'custom', path, message });

      if (ageType === 'range') {
        // The page always shows a range, so none sent is refused where the first one goes.
        if (ageRanges.length === 0) {
          issue(['ageRanges', 0, 'lowerLimit'], 'You must enter at least a lower or upper limit');
        }

        for (const [index, range] of ageRanges.entries()) {
          for (const [part, message] of Object.entries(ageRangeProblems(range, index))) {
            issue(['ageRanges', index, part], message);
          }
        }
      }

      if (ageType === 'specific') {
        const problems = ageProblems(
          ['specificAge', 'specificAgeUnit'],
          specificAge,
          specificAgeUnit,
          {
            enter: 'Enter the age',
            wholeNumber: `Age must be a whole number from 0 to ${MAX_AGE}`,
            select: SELECT_AGE_UNIT,
          },
        );

        for (const [field, message] of Object.entries(problems)) issue([field], message);
      }

      if (ageType === 'other' && ageDetail === '') {
        issue(['ageDetail'], 'Enter the ages included');
      }
    },
    // Also beside an unanswered age type or refused text, so every refusal shows at once.
    {
      when: ({ issues }) =>
        issues.every(({ code, path }) => code === 'custom' || path?.[0] === 'ageType'),
    },
  );

export type Ages = z.infer<typeof schema>;

/** The page's fields: a range's are named by its row, and the list itself refuses as a whole. */
export type AgesPageField = AgesField | AgeRangeField;

/** A range's fields in the order the page asks them. */
export const AGE_RANGE_PARTS: readonly AgeRangePart[] = [
  ...AGE_LIMIT_FIELDS.lower,
  ...AGE_LIMIT_FIELDS.upper,
];

const errorFields = z.union([
  fields,
  z.templateLiteral(['ageRanges[', z.number().int().min(0), '].', z.enum(AGE_RANGE_PARTS)]),
]);

const storedAgeUnit = z.enum(AGE_UNITS);

/** The draft's answers: null or empty until answered, with each age as a number. */
export const agesAnswersSchema = z.object({
  ageType: z.enum(AGE_TYPES).nullable(),
  ageRanges: z.array(
    z.object({
      lowerLimit: z.number().nullable(),
      lowerLimitUnit: storedAgeUnit.nullable(),
      upperLimit: z.number().nullable(),
      upperLimitUnit: storedAgeUnit.nullable(),
    }),
  ),
  specificAge: z.number().nullable(),
  specificAgeUnit: storedAgeUnit.nullable(),
  ageDetail: z.string().nullable(),
});

export type AgesAnswers = z.infer<typeof agesAnswersSchema>;

const text = (value: number | string | null): string => (value === null ? '' : String(value));

export const agesSection: IndicatorSection<
  AgesField,
  Ages,
  AgesFormValues,
  AgesPageField,
  AgesAnswers
> = {
  key: 'ages',
  fields,
  schema,
  errorFields,
  formValues: (answers) => ({
    ageType: text(answers.ageType),
    ageRanges: answers.ageRanges.map((range) => ({
      lowerLimit: text(range.lowerLimit),
      lowerLimitUnit: text(range.lowerLimitUnit),
      upperLimit: text(range.upperLimit),
      upperLimitUnit: text(range.upperLimitUnit),
    })),
    specificAge: text(answers.specificAge),
    specificAgeUnit: text(answers.specificAgeUnit),
    ageDetail: text(answers.ageDetail),
  }),
};
