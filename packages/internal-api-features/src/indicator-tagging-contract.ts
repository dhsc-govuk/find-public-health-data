import { z } from '@fphd/config/zod';

import {
  ANSWER_NOT_READ,
  type IndicatorSection,
  yesNoSchema,
} from './indicator-section-contract.ts';

/** One tag a publisher may choose: a topic or a classification. */
export const tagOptionSchema = z.object({ id: z.uuid(), name: z.string().min(1) });

/** Every tag the tagging page offers, each list in the order the page shows it. */
export const tagOptionsSchema = z.object({
  topics: z.array(tagOptionSchema),
  subtopics: z.array(tagOptionSchema.extend({ topicId: z.uuid() })),
  indicatorTypes: z.array(tagOptionSchema),
  lifeStages: z.array(tagOptionSchema),
  frameworks: z.array(tagOptionSchema),
});

export type TagOption = z.infer<typeof tagOptionSchema>;
export type TagOptions = z.infer<typeof tagOptionsSchema>;

/** The page's lists of chosen tags, in the order it asks them. */
export const TAG_LISTS = [
  'topicIds',
  'subtopicIds',
  'indicatorTypeIds',
  'lifeStageIds',
  'frameworkIds',
] as const;

export type TagList = (typeof TAG_LISTS)[number];

/** The questions whose yes asks for a list, and whose no drops it when saved. */
export type TagQuestion = 'hasLifeStage' | 'hasFramework';

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
  lifeStageIds: {
    options: 'lifeStages',
    question: 'hasLifeStage',
    noun: 'life stage',
    article: 'a',
  },
  frameworkIds: {
    options: 'frameworks',
    question: 'hasFramework',
    noun: 'framework or programme',
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

const fields = z.enum([
  'isAreaContext',
  'topicIds',
  'primaryTopicId',
  'subtopicIds',
  'primarySubtopicId',
  'indicatorTypeIds',
  'hasLifeStage',
  'lifeStageIds',
  'hasFramework',
  'frameworkIds',
]);

export type TaggingField = z.infer<typeof fields>;

/** The answers as the form holds them: each list's ids, and each question's choice as text. */
export interface TaggingFormValues {
  isAreaContext?: 'yes' | undefined;
  topicIds: string[];
  primaryTopicId: string;
  subtopicIds: string[];
  primarySubtopicId: string;
  indicatorTypeIds: string[];
  hasLifeStage: string;
  lifeStageIds: string[];
  hasFramework: string;
  frameworkIds: string[];
}

/** A list's ids, each once in the order added; at least one where `required` says so. */
function tagIds(list: TagList, required?: string) {
  const each = z.array(z.uuid(unknownTagMessage(list)));

  return z
    .array(z.string())
    .transform((sent) => [...new Set(sent)])
    .pipe(required === undefined ? each : each.min(1, required));
}

const taggedSchema = z
  .object({
    topicIds: tagIds('topicIds', 'Select at least one topic'),
    primaryTopicId: z.uuid('Select a primary topic'),
    subtopicIds: tagIds('subtopicIds'),
    primarySubtopicId: z.union([z.literal(''), z.uuid('Select a primary subtopic')]),
    indicatorTypeIds: tagIds('indicatorTypeIds', 'Select a measure type').pipe(
      z.array(z.uuid()).max(1, 'Select only one measure type'),
    ),
    hasLifeStage: yesNoSchema('Select whether this indicator needs a life stage tag'),
    lifeStageIds: tagIds('lifeStageIds'),
    hasFramework: yesNoSchema('Select whether this indicator is part of a framework or programme'),
    frameworkIds: tagIds('frameworkIds'),
  })
  .superRefine(
    (
      {
        topicIds,
        primaryTopicId,
        subtopicIds,
        primarySubtopicId,
        hasLifeStage,
        lifeStageIds,
        hasFramework,
        frameworkIds,
      },
      ctx,
    ) => {
      if (primaryTopicId && !topicIds.includes(primaryTopicId))
        ctx.addIssue({
          code: 'custom',
          path: ['primaryTopicId'],
          message: 'Select a primary topic from the topics added',
        });
      if (primarySubtopicId && !subtopicIds.includes(primarySubtopicId))
        ctx.addIssue({
          code: 'custom',
          path: ['primarySubtopicId'],
          message: 'Select a primary subtopic from the subtopics added',
        });
      if (hasLifeStage === 'yes' && lifeStageIds.length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['lifeStageIds'],
          message: 'Select at least one life stage',
        });
      }

      if (hasFramework === 'yes' && frameworkIds.length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['frameworkIds'],
          message: 'Select at least one framework or programme',
        });
      }
    },
    // Also beside unanswered questions and empty lists, so every refusal shows at once.
    {
      when: ({ value, issues }) =>
        typeof value === 'object' &&
        value !== null &&
        issues.every(({ path }) => path?.[0] !== 'lifeStageIds' && path?.[0] !== 'frameworkIds'),
    },
  );

const schema = z
  .object({
    // The web app sends "yes" or leaves the answer out, so another value comes only from a
    // broken or hand-made request.
    isAreaContext: z.literal('yes', ANSWER_NOT_READ).optional(),
    topicIds: z.array(z.string()),
    primaryTopicId: z.string(),
    subtopicIds: z.array(z.string()),
    primarySubtopicId: z.string(),
    indicatorTypeIds: z.array(z.string()),
    hasLifeStage: z.string(),
    lifeStageIds: z.array(z.string()),
    hasFramework: z.string(),
    frameworkIds: z.array(z.string()),
  })
  .transform((values, ctx) => {
    if (values.isAreaContext === 'yes')
      return {
        isAreaContext: 'yes' as const,
        topicIds: [],
        primaryTopicId: '',
        subtopicIds: [],
        primarySubtopicId: '',
        indicatorTypeIds: [],
        lifeStageIds: [],
        frameworkIds: [],
        hasLifeStage: 'no' as const,
        hasFramework: 'no' as const,
      };
    const result = taggedSchema.safeParse(values);
    if (!result.success) {
      for (const issue of result.error.issues)
        ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message });
      return z.NEVER;
    }
    const answers: z.output<typeof taggedSchema> & { isAreaContext?: 'yes' | undefined } =
      result.data;
    return answers;
  });

export type Tagging = z.infer<typeof schema>;

/** The draft's answers: null until a question is answered, and no tags until some are chosen. */
export const taggingAnswersSchema = z.object({
  isAreaContext: z.literal('yes').optional(),
  topicIds: z.array(z.string()),
  primaryTopicId: z.string().nullable(),
  subtopicIds: z.array(z.string()),
  primarySubtopicId: z.string().nullable(),
  indicatorTypeIds: z.array(z.string()),
  hasLifeStage: z.enum(['yes', 'no']).nullable(),
  lifeStageIds: z.array(z.string()),
  hasFramework: z.enum(['yes', 'no']).nullable(),
  frameworkIds: z.array(z.string()),
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
    primaryTopicId: answers.primaryTopicId ?? '',
    primarySubtopicId: answers.primarySubtopicId ?? '',
    hasLifeStage: answers.hasLifeStage ?? '',
    hasFramework: answers.hasFramework ?? '',
  }),
};
