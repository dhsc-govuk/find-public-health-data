import { z } from '@fphd/config/zod';
import {
  AGE_TYPES,
  AGE_UNIT_DAYS,
  AGE_UNITS,
  type AgeUnit,
  MAX_AGE,
} from '@fphd/utils/sex-and-ages';
import {
  DEMOGRAPHICS,
  type Demographic,
  ETHNIC_GROUPS,
  GENDERS,
  SEXES,
} from '@fphd/utils/sex-gender-and-ethnicity';

import type { IndicatorSection } from './indicator-section-contract.ts';
import { shortText } from './text-contract.ts';

export const MAX_AGE_RANGES = 20;

const fields = z.enum([
  'demographics',
  'sexes',
  'genders',
  'ethnicGroups',
  'ageType',
  'ageRanges',
  'specificAge',
  'specificAgeUnit',
  'ageDetail',
]);

export type SexAndAgesField = z.infer<typeof fields>;

/** One age range as the form holds it: each limit and its unit as text. */
export interface AgeRangeFormValues {
  lowerLimit: string;
  lowerLimitUnit: string;
  upperLimit: string;
  upperLimitUnit: string;
}

export type AgeRangePart = keyof AgeRangeFormValues;

/** The answers as the form holds them: the boxes ticked in each group, and other controls as text. */
export interface SexAndAgesFormValues {
  demographics: string[];
  sexes: string[];
  genders: string[];
  ethnicGroups: string[];
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

/** The field holding the list each demographic asks for when it is collected. */
export const DEMOGRAPHIC_LIST_FIELDS = {
  sex: 'sexes',
  gender: 'genders',
  ethnicity: 'ethnicGroups',
} as const satisfies Record<Demographic, SexAndAgesField>;

type DemographicListField = (typeof DEMOGRAPHIC_LIST_FIELDS)[Demographic];

const SELECT_DEMOGRAPHICS = 'Select what was collected for this indicator';

const SELECT_INCLUDED: Readonly<Record<Demographic, string>> = {
  sex: 'Select the sexes included',
  gender: 'Select the genders included',
  ethnicity: 'Select the ethnic groups included',
};

/** The questions about what was collected, and which sexes, genders and ethnic groups. */
const DEMOGRAPHIC_FIELDS: ReadonlySet<PropertyKey | undefined> = new Set([
  'demographics',
  ...Object.values(DEMOGRAPHIC_LIST_FIELDS),
]);

/** The boxes ticked in a group offering `values`. A value it does not offer gets its message. */
function ticked<const Values extends readonly [string, ...string[]]>(
  values: Values,
  message: string,
) {
  return z.array(z.enum(values, { error: message }), { error: message });
}

/** The values ticked in the order the page lists them, once each, whatever order they came in. */
function inPageOrder<Value extends string>(values: readonly Value[]) {
  return (sent: readonly Value[]): Value[] => values.filter((value) => sent.includes(value));
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
    demographics: ticked(DEMOGRAPHICS, SELECT_DEMOGRAPHICS)
      .min(1, SELECT_DEMOGRAPHICS)
      .transform(inPageOrder(DEMOGRAPHICS)),
    sexes: ticked(SEXES, SELECT_INCLUDED.sex).transform(inPageOrder(SEXES)),
    genders: ticked(GENDERS, SELECT_INCLUDED.gender).transform(inPageOrder(GENDERS)),
    ethnicGroups: ticked(ETHNIC_GROUPS, SELECT_INCLUDED.ethnicity).transform(
      inPageOrder(ETHNIC_GROUPS),
    ),
    ageType: z.enum(AGE_TYPES, { error: 'Select the age type' }),
    ageRanges: z
      .array(ageRange)
      .max(MAX_AGE_RANGES, `You cannot add more than ${MAX_AGE_RANGES} ranges`),
    specificAge: z.string().trim(),
    specificAgeUnit: ageUnit,
    ageDetail: shortText('Ages included'),
  })
  // A demographic that was collected needs at least one of its list ticked. The list of one that
  // was not collected need not hold anything, since the save clears it.
  .superRefine(
    (answers, ctx) => {
      for (const demographic of answers.demographics) {
        const field: DemographicListField = DEMOGRAPHIC_LIST_FIELDS[demographic];
        // A list that is itself refused, such as one not sent at all, is read as it came.
        const list: unknown = answers[field];

        if (Array.isArray(list) && list.length === 0) {
          ctx.addIssue({ code: 'custom', path: [field], message: SELECT_INCLUDED[demographic] });
        }
      }
    },
    // Also beside every other refusal, so they all show at once, unless what was collected is
    // itself refused. An issue with no path refuses the whole input, which then has nothing to
    // read.
    {
      when: ({ issues }) =>
        issues.every(({ path }) => path?.[0] !== undefined && path[0] !== 'demographics'),
    },
  )
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
    // Also beside refused answers about what was collected, an unanswered age type, or refused
    // text, so every refusal shows at once.
    {
      when: ({ issues }) =>
        issues.every(
          ({ code, path }) =>
            code === 'custom' || DEMOGRAPHIC_FIELDS.has(path?.[0]) || path?.[0] === 'ageType',
        ),
    },
  );

export type SexAndAges = z.infer<typeof schema>;

/** The page's fields: a range's are named by its row, and the list itself refuses as a whole. */
export type SexAndAgesPageField = SexAndAgesField | AgeRangeField;

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
export const sexAndAgesAnswersSchema = z.object({
  demographics: z.array(z.enum(DEMOGRAPHICS)),
  sexes: z.array(z.enum(SEXES)),
  genders: z.array(z.enum(GENDERS)),
  ethnicGroups: z.array(z.enum(ETHNIC_GROUPS)),
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

export type SexAndAgesAnswers = z.infer<typeof sexAndAgesAnswersSchema>;

const text = (value: number | string | null): string => (value === null ? '' : String(value));

export const sexAndAgesSection: IndicatorSection<
  SexAndAgesField,
  SexAndAges,
  SexAndAgesFormValues,
  SexAndAgesPageField,
  SexAndAgesAnswers
> = {
  key: 'sex-and-ages',
  fields,
  schema,
  errorFields,
  formValues: (answers) => ({
    demographics: answers.demographics,
    sexes: answers.sexes,
    genders: answers.genders,
    ethnicGroups: answers.ethnicGroups,
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
