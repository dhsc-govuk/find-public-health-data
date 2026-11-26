import { z } from '@fphd/config/zod';
import { GOAL_POLARITIES } from '@fphd/utils/polarity';
import { GOAL_LOWER_COMPARISONS, GOAL_UPPER_COMPARISONS } from '@fphd/utils/policy-goal';

import { type IndicatorSection, yesNoSchema } from './indicator-section-contract.ts';
import { longText } from './text-contract.ts';

export const MAX_POLICY_GOALS = 10;

const fields = z.enum(['hasGoalBenchmark', 'goals']);

export type BenchmarkingField = z.infer<typeof fields>;

/** One policy goal as the form holds it, as text. */
export interface PolicyGoalFormValues {
  lowerComparison: string;
  lowerValue: string;
  upperComparison: string;
  upperValue: string;
  polarity: string;
  detail: string;
}

export type PolicyGoalPart = keyof PolicyGoalFormValues;

/** A goal's fields in the order the page asks them. */
export const POLICY_GOAL_PARTS: readonly PolicyGoalPart[] = [
  'lowerComparison',
  'lowerValue',
  'upperComparison',
  'upperValue',
  'polarity',
  'detail',
];

/** The answers as the form holds them, as text. */
export interface BenchmarkingFormValues {
  hasGoalBenchmark: string;
  goals: PolicyGoalFormValues[];
}

/** A field of one goal, named as its control is and as its refusal is keyed. */
export type PolicyGoalField = `goals[${number}].${PolicyGoalPart}`;

export function policyGoalFieldName(index: number, part: PolicyGoalPart): PolicyGoalField {
  return `goals[${index}].${part}`;
}

/**
 * The words that say which goal a field belongs to, such as " for policy goal 2". The first goal
 * is not numbered, so a page with one goal reads as a single question.
 */
export function policyGoalOf(index: number): string {
  return index === 0 ? '' : ` for policy goal ${index + 1}`;
}

// Commas only as thousands separators, so "9,5" is never read as 95 nor "0,500" as 500.
const GOAL_VALUE = /^-?(?:(?:[1-9]\d{0,2}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)$/;

/** The number a goal value's text gives, or undefined for a blank or anything else. */
export function goalValue(text: string): number | undefined {
  if (!GOAL_VALUE.test(text)) return undefined;
  const value = Number(text.replaceAll(',', ''));
  return Number.isFinite(value) ? value : undefined;
}

const PLAIN_DECIMAL = new Intl.NumberFormat('en-GB', {
  useGrouping: false,
  maximumSignificantDigits: 21,
});

/** A stored goal value as the form shows it, never in exponent form, so it reads back the same. */
export function goalValueText(value: number | null): string | null {
  return value === null ? null : PLAIN_DECIMAL.format(value);
}

/** A choice of a goal, refused with the message for choosing nothing, naming the goal it is in. */
function goalChoice<Option extends string>(options: readonly Option[], message: string) {
  return z.enum(['', ...options], {
    error: ({ path }) => `${message}${policyGoalOf(typeof path?.[1] === 'number' ? path[1] : 0)}`,
  });
}

const policyGoal = z.object({
  lowerComparison: goalChoice(
    GOAL_LOWER_COMPARISONS,
    'Select the comparison for the lower goal value',
  ),
  lowerValue: z.string().trim(),
  upperComparison: goalChoice(
    GOAL_UPPER_COMPARISONS,
    'Select the comparison for the upper goal value',
  ),
  upperValue: z.string().trim(),
  polarity: goalChoice(GOAL_POLARITIES, 'Select the polarity of the goal'),
  detail: longText('Detail about the policy goal'),
});

type PolicyGoal = z.infer<typeof policyGoal>;

/** Why one goal is refused, keyed by the part at fault. */
function policyGoalProblems(
  goal: PolicyGoal,
  index: number,
): Partial<Record<PolicyGoalPart, string>> {
  const of = policyGoalOf(index);
  const problems: Partial<Record<PolicyGoalPart, string>> = {};
  const lower = goalValue(goal.lowerValue);
  const upper = goalValue(goal.upperValue);

  if (goal.lowerComparison === '') {
    problems.lowerComparison = `Select the comparison for the lower goal value${of}`;
  }

  if (goal.lowerValue === '') problems.lowerValue = `Enter the lower goal value${of}`;
  else if (lower === undefined) problems.lowerValue = `Lower goal value${of} must be a number`;

  if (goal.upperValue !== '' && goal.upperComparison === '') {
    problems.upperComparison = `Select the comparison for the upper goal value${of}`;
  }

  if (goal.upperValue !== '' && upper === undefined) {
    problems.upperValue = `Upper goal value${of} must be a number`;
  } else if (lower !== undefined && upper !== undefined && upper <= lower) {
    problems.upperValue = `Upper goal value${of} must be higher than the lower goal value`;
  }

  if (goal.polarity === '') problems.polarity = `Select the polarity of the goal${of}`;

  return problems;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasValuesAsText(goal: unknown): boolean {
  return (
    isRecord(goal) && typeof goal.lowerValue === 'string' && typeof goal.upperValue === 'string'
  );
}

const schema = z
  .object({
    hasGoalBenchmark: yesNoSchema(
      'Select whether there are any goal benchmarks for this indicator',
    ),
    goals: z
      .array(policyGoal)
      .max(MAX_POLICY_GOALS, `You cannot add more than ${MAX_POLICY_GOALS} policy goals`),
  })
  .superRefine(
    ({ hasGoalBenchmark, goals }, ctx) => {
      if (hasGoalBenchmark !== 'yes') return;

      // The page always shows a goal, so none sent is refused where the first one goes.
      if (goals.length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['goals', 0, 'lowerValue'],
          message: 'Enter the lower goal value',
        });
      }

      for (const [index, goal] of goals.entries()) {
        for (const [part, message] of Object.entries(policyGoalProblems(goal, index))) {
          ctx.addIssue({ code: 'custom', path: ['goals', index, part], message });
        }
      }
    },
    // Also beside an unanswered question or a goal's refused choice or text, so every refusal
    // shows at once. Only goals whose values the checks can read as text are checked.
    {
      when: ({ value }) =>
        isRecord(value) && Array.isArray(value.goals) && value.goals.every(hasValuesAsText),
    },
  );

export type Benchmarking = z.infer<typeof schema>;

/** The page's fields: a goal's are named by its row, and the list itself refuses as a whole. */
export type BenchmarkingPageField = BenchmarkingField | PolicyGoalField;

const errorFields = z.union([
  fields,
  z.templateLiteral(['goals[', z.number().int().min(0), '].', z.enum(POLICY_GOAL_PARTS)]),
]);

/** The draft's answers: null or empty until answered, with each value as a number. */
export const benchmarkingAnswersSchema = z.object({
  hasGoalBenchmark: z.enum(['yes', 'no']).nullable(),
  goals: z.array(
    z.object({
      lowerComparison: z.enum(GOAL_LOWER_COMPARISONS),
      lowerValue: z.number(),
      upperComparison: z.enum(GOAL_UPPER_COMPARISONS).nullable(),
      upperValue: z.number().nullable(),
      polarity: z.enum(GOAL_POLARITIES),
      policyDetail: z.string().nullable(),
    }),
  ),
});

export type BenchmarkingAnswers = z.infer<typeof benchmarkingAnswersSchema>;

/** Whether the indicator has policy goals, and the values and direction that meet each one. */
export const benchmarkingSection: IndicatorSection<
  BenchmarkingField,
  Benchmarking,
  BenchmarkingFormValues,
  BenchmarkingPageField,
  BenchmarkingAnswers
> = {
  key: 'benchmarking',
  fields,
  schema,
  errorFields,
  formValues: (answers) => ({
    hasGoalBenchmark: answers.hasGoalBenchmark ?? '',
    goals: answers.goals.map((goal) => ({
      lowerComparison: goal.lowerComparison,
      lowerValue: goalValueText(goal.lowerValue) ?? '',
      upperComparison: goal.upperComparison ?? '',
      upperValue: goalValueText(goal.upperValue) ?? '',
      polarity: goal.polarity,
      detail: goal.policyDetail ?? '',
    })),
  }),
};
