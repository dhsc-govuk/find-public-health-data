import { z } from '@fphd/config/zod';
import {
  DEMOGRAPHICS,
  type Demographic,
  ETHNIC_GROUPS,
  GENDERS,
  SEXES,
} from '@fphd/utils/sex-gender-and-ethnicity';

import type { IndicatorSection } from './indicator-section-contract.ts';

const fields = z.enum(['demographics', 'sexes', 'genders', 'ethnicGroups']);

export type SexGenderAndEthnicityField = z.infer<typeof fields>;

/** The answers as the form holds them: the boxes ticked in each group. */
export interface SexGenderAndEthnicityFormValues {
  demographics: string[];
  sexes: string[];
  genders: string[];
  ethnicGroups: string[];
}

/** The field holding the list each demographic asks for when it is collected. */
export const DEMOGRAPHIC_LIST_FIELDS = {
  sex: 'sexes',
  gender: 'genders',
  ethnicity: 'ethnicGroups',
} as const satisfies Record<Demographic, SexGenderAndEthnicityField>;

type DemographicListField = (typeof DEMOGRAPHIC_LIST_FIELDS)[Demographic];

const SELECT_DEMOGRAPHICS = 'Select what was collected for this indicator';

const SELECT_INCLUDED: Readonly<Record<Demographic, string>> = {
  sex: 'Select the sexes included',
  gender: 'Select the genders included',
  ethnicity: 'Select the ethnic groups included',
};

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
  );

export type SexGenderAndEthnicity = z.infer<typeof schema>;

/** The draft's answers: empty until answered. */
export const sexGenderAndEthnicityAnswersSchema = z.object({
  demographics: z.array(z.enum(DEMOGRAPHICS)),
  sexes: z.array(z.enum(SEXES)),
  genders: z.array(z.enum(GENDERS)),
  ethnicGroups: z.array(z.enum(ETHNIC_GROUPS)),
});

export type SexGenderAndEthnicityAnswers = z.infer<typeof sexGenderAndEthnicityAnswersSchema>;

export const sexGenderAndEthnicitySection: IndicatorSection<
  SexGenderAndEthnicityField,
  SexGenderAndEthnicity,
  SexGenderAndEthnicityFormValues,
  SexGenderAndEthnicityField,
  SexGenderAndEthnicityAnswers
> = {
  key: 'sex-gender-and-ethnicity',
  fields,
  schema,
  formValues: (answers) => ({
    demographics: answers.demographics,
    sexes: answers.sexes,
    genders: answers.genders,
    ethnicGroups: answers.ethnicGroups,
  }),
};
