import { z } from '@fphd/config/zod';

import { type IndicatorSection, yesNoSchema } from './indicator-section-contract.ts';
import { shortText } from './text-contract.ts';

/** One tag a publisher may choose: a topic or a classification. */
export const tagOptionSchema = z.object({ id: z.uuid(), name: z.string().min(1) });

/** Every tag the tagging page offers, each list in the order the page shows it. */
export const tagOptionsSchema = z.object({
  topics: z.array(tagOptionSchema),
  subtopics: z.array(tagOptionSchema.extend({ topicId: z.uuid() })),
  indicatorTypes: z.array(tagOptionSchema),
  frameworks: z.array(tagOptionSchema),
  lifeStages: z.array(tagOptionSchema),
  riskFactors: z.array(tagOptionSchema),
});

export type TagOption = z.infer<typeof tagOptionSchema>;
export type TagOptions = z.infer<typeof tagOptionsSchema>;

/** The page's lists of chosen tags, in the order it asks them. */
export const TAG_LISTS = [
  'topicIds',
  'subtopicIds',
  'indicatorTypeIds',
  'frameworkIds',
  'lifeStageIds',
  'riskFactorIds',
] as const;

export type TagList = (typeof TAG_LISTS)[number];

/** The questions whose yes asks for a list, and whose no drops it when saved. */
type TagQuestion = 'hasFramework' | 'hasLifeStage' | 'hasRiskFactor';

/** Where each list's choices come from, the question asking for it, and its messages' words. */
export const TAG_LIST_DETAILS = {
  topicIds: { options: 'topics', question: null, noun: 'topic', article: 'a' },
  subtopicIds: { options: 'subtopics', question: null, noun: 'subtopic', article: 'a' },
  indicatorTypeIds: {
    options: 'indicatorTypes',
    question: null,
    noun: 'measure type',
    article: 'a',
  },
  frameworkIds: {
    options: 'frameworks',
    question: 'hasFramework',
    noun: 'framework or programme',
    article: 'a',
  },
  lifeStageIds: {
    options: 'lifeStages',
    question: 'hasLifeStage',
    noun: 'life stage',
    article: 'a',
  },
  riskFactorIds: {
    options: 'riskFactors',
    question: 'hasRiskFactor',
    noun: 'risk factor',
    article: 'a',
  },
} as const satisfies Record<
  TagList,
  { options: keyof TagOptions; question: TagQuestion | null; noun: string; article: 'a' | 'an' }
>;

/** "Select a topic from the list", for a tag the page no longer offers. */
export function unknownTagMessage(list: TagList): string {
  const { article, noun } = TAG_LIST_DETAILS[list];
  return `Select ${article} ${noun} from the list`;
}

/** "Select a subtopic for Cancer", for a topic chosen without one of its subtopics. */
export function subtopicRequiredMessage(topic: TagOption): string {
  return `Select a subtopic for ${topic.name}`;
}

/** The subtopics the page offers under a topic, which must have one of them if it has any. */
export function subtopicsOf(options: TagOptions, topicId: string): TagOptions['subtopics'] {
  return options.subtopics.filter((subtopic) => subtopic.topicId === topicId);
}

const fields = z.enum([
  'topicIds',
  'subtopicIds',
  'indicatorTypeIds',
  'hasFramework',
  'frameworkIds',
  'phofIndicatorNumber',
  'hasLifeStage',
  'lifeStageIds',
  'hasRiskFactor',
  'riskFactorIds',
]);

export type TaggingField = z.infer<typeof fields>;

/** The answers as the form holds them: each list's ids, and each other answer as text. */
export interface TaggingFormValues {
  topicIds: string[];
  subtopicIds: string[];
  indicatorTypeIds: string[];
  hasFramework: string;
  frameworkIds: string[];
  phofIndicatorNumber: string;
  hasLifeStage: string;
  lifeStageIds: string[];
  hasRiskFactor: string;
  riskFactorIds: string[];
}

/** A list's ids, each once in the order added; at least one where `required` says so. */
function tagIds(list: TagList, required?: string) {
  const each = z.array(z.uuid(unknownTagMessage(list)));

  return z
    .array(z.string())
    .transform((sent) => [...new Set(sent)])
    .pipe(required === undefined ? each : each.min(1, required));
}

/** The lists a yes asks for, with the message when that yes has none. */
const LISTS_ASKED_BY_YES = [
  ['hasFramework', 'frameworkIds', 'Select at least one framework or programme'],
  ['hasLifeStage', 'lifeStageIds', 'Select at least one life stage'],
  ['hasRiskFactor', 'riskFactorIds', 'Select at least one risk factor'],
] as const satisfies readonly (readonly [TagQuestion, TagList, string])[];

const schema = z
  .object({
    topicIds: tagIds('topicIds', 'Select at least one topic'),
    subtopicIds: tagIds('subtopicIds'),
    indicatorTypeIds: tagIds('indicatorTypeIds', 'Select a measure type').pipe(
      z.array(z.uuid()).max(1, 'Select only one measure type'),
    ),
    hasFramework: yesNoSchema('Select whether this indicator is part of a framework or programme'),
    frameworkIds: tagIds('frameworkIds'),
    phofIndicatorNumber: shortText('PHOF indicator number'),
    hasLifeStage: yesNoSchema(
      'Select whether you need to include the life stage the indicator relates to',
    ),
    lifeStageIds: tagIds('lifeStageIds'),
    hasRiskFactor: yesNoSchema('Select whether this indicator includes a risk factor'),
    riskFactorIds: tagIds('riskFactorIds'),
  })
  .superRefine(
    (answers, ctx) => {
      for (const [question, list, message] of LISTS_ASKED_BY_YES) {
        if (answers[question] === 'yes' && answers[list].length === 0)
          ctx.addIssue({ code: 'custom', path: [list], message });
      }
    },
    // Also beside unanswered questions and empty lists, so every refusal shows at once.
    {
      when: ({ value, issues }) =>
        typeof value === 'object' &&
        value !== null &&
        issues.every(({ path }) => !LISTS_ASKED_BY_YES.some(([, list]) => path?.[0] === list)),
    },
  );

export type Tagging = z.infer<typeof schema>;

/** The draft's answers: null until a question is answered, and no tags until some are chosen. */
export const taggingAnswersSchema = z.object({
  topicIds: z.array(z.string()),
  subtopicIds: z.array(z.string()),
  indicatorTypeIds: z.array(z.string()),
  hasFramework: z.enum(['yes', 'no']).nullable(),
  frameworkIds: z.array(z.string()),
  phofIndicatorNumber: z.string().nullable(),
  hasLifeStage: z.enum(['yes', 'no']).nullable(),
  lifeStageIds: z.array(z.string()),
  hasRiskFactor: z.enum(['yes', 'no']).nullable(),
  riskFactorIds: z.array(z.string()),
});

export type TaggingAnswers = z.infer<typeof taggingAnswersSchema>;

export const taggingSection: IndicatorSection<
  TaggingField,
  Tagging,
  TaggingFormValues,
  TaggingField,
  TaggingAnswers
> = {
  key: 'tagging',
  fields,
  schema,
  formValues: (answers) => ({
    ...answers,
    hasFramework: answers.hasFramework ?? '',
    phofIndicatorNumber: answers.phofIndicatorNumber ?? '',
    hasLifeStage: answers.hasLifeStage ?? '',
    hasRiskFactor: answers.hasRiskFactor ?? '',
  }),
};
