import { z } from '@fphd/config/zod';
import { ukDaysUntil, ukInstant } from '@fphd/utils/uk-time';

import {
  addIssues,
  areProviderSourcesOffered,
  type ConfidenceIntervalsField,
  confidenceIntervalsSection,
  confidenceIntervalsSectionFor,
  type ProviderSourcesSection,
  PUBLISHING_NOTICE_DAYS,
  type PublishingDateField,
  publishingDateSection,
  REAL_PUBLISHING_TIME,
  SELECT_DATA_PROVIDER,
  SELECT_UNITS,
  SELECT_VALUE_TYPE,
  TAG_LIST_DETAILS,
  TAG_LISTS,
  type Tagging,
  type TaggingAnswers,
  type TaggingField,
  type TaggingFormValues,
  taggingSection,
  unknownTagMessage,
  type ValueTypeAndUnits,
  type ValueTypeAndUnitsField,
  valueTypeAndUnitsSection,
} from './contract.ts';
import type {
  ConfidenceIntervalsWithKind,
  PublishingDateWithInstant,
} from './indicator-section-columns.ts';
import type { IndicatorSection } from './indicator-section-contract.ts';
import { isTagListAsked } from './indicator-section-list-columns.ts';
import type {
  InternalCiMethodRepository,
  InternalDataProviderRepository,
  InternalTagRepository,
  InternalValueTypeAndUnitRepository,
} from './repositories.ts';

/** The form's schema, then that every tag asked for is one the page offers under its question. */
export function taggingServerSection(
  tags: InternalTagRepository,
): IndicatorSection<TaggingField, Tagging, TaggingFormValues, TaggingField, TaggingAnswers> {
  return {
    ...taggingSection,
    schema: taggingSection.schema.transform(async (answers, ctx) => {
      if (answers.isAreaContext === 'yes') return answers;
      const options = await tags.listOptions();
      let refused = false;

      for (const list of TAG_LISTS.filter((asked) => isTagListAsked(answers, asked))) {
        const offered = new Set(options[TAG_LIST_DETAILS[list].options].map(({ id }) => id));

        if (answers[list].some((id) => !offered.has(id))) {
          ctx.addIssue({ code: 'custom', path: [list], message: unknownTagMessage(list) });
          refused = true;
        }
      }

      const selectedSubtopics = options.subtopics.filter(({ id }) =>
        answers.subtopicIds.includes(id),
      );
      if (selectedSubtopics.some(({ topicId }) => !answers.topicIds.includes(topicId))) {
        ctx.addIssue({
          code: 'custom',
          path: ['subtopicIds'],
          message: 'Select subtopics belonging to the topics added',
        });
        refused = true;
      }
      const primaryChildren = selectedSubtopics.filter(
        ({ topicId }) => topicId === answers.primaryTopicId,
      );
      if (
        (primaryChildren.length > 0 || answers.primarySubtopicId !== '') &&
        !primaryChildren.some(({ id }) => id === answers.primarySubtopicId)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['primarySubtopicId'],
          message: 'Select a primary subtopic belonging to the primary topic',
        });
        refused = true;
      }

      return refused ? z.NEVER : answers;
    }),
  };
}

/** The form's schema, then the requirements of the chosen method, read from its row. */
export function confidenceIntervalsServerSection(
  ciMethods: InternalCiMethodRepository,
): IndicatorSection<ConfidenceIntervalsField, ConfidenceIntervalsWithKind> {
  return {
    ...confidenceIntervalsSection,
    schema: confidenceIntervalsSection.schema.transform(async (answers, ctx) => {
      const kind = (await ciMethods.findById(answers.ciMethodId))?.kind ?? null;
      const checked = confidenceIntervalsSectionFor(kind).schema.safeParse(answers);

      if (checked.success && kind !== null) return { ...checked.data, kind };

      for (const { path, message } of checked.error?.issues ?? []) {
        ctx.addIssue({ code: 'custom', path, message });
      }
      return z.NEVER;
    }),
  };
}

/** The form's schema, then that the value type and unit are ones the page offers. */
export function valueTypeAndUnitsServerSection(
  valueTypesAndUnits: InternalValueTypeAndUnitRepository,
): IndicatorSection<ValueTypeAndUnitsField, ValueTypeAndUnits> {
  return {
    ...valueTypeAndUnitsSection,
    schema: valueTypeAndUnitsSection.schema.transform(async (answers, ctx) => {
      const { valueTypes, units } = await valueTypesAndUnits.listOptions();
      const offers = (options: { id: string }[], id: string) => options.some((o) => o.id === id);
      let refused = false;

      if (!offers(valueTypes, answers.valueTypeId)) {
        ctx.addIssue({ code: 'custom', path: ['valueTypeId'], message: SELECT_VALUE_TYPE });
        refused = true;
      }
      if (!offers(units, answers.unitId)) {
        ctx.addIssue({ code: 'custom', path: ['unitId'], message: SELECT_UNITS });
        refused = true;
      }

      return refused ? z.NEVER : answers;
    }),
  };
}

/**
 * The form's schema, then a date at least the notice period after today's in the UK, whatever
 * the time, and the instant the answers name, which must exist in UK time.
 */
export function publishingDateServerSection(
  now: () => Date,
): IndicatorSection<PublishingDateField, PublishingDateWithInstant> {
  return {
    ...publishingDateSection,
    schema: publishingDateSection.schema.transform((answers, ctx) => {
      const date = {
        year: Number(answers.publishingDateYear),
        month: Number(answers.publishingDateMonth),
        day: Number(answers.publishingDateDay),
      };

      if (ukDaysUntil(now(), date) < PUBLISHING_NOTICE_DAYS) {
        addIssues(
          ctx,
          ['publishingDateDay', 'publishingDateMonth', 'publishingDateYear'],
          `Publishing date must be at least ${PUBLISHING_NOTICE_DAYS} days from today`,
        );
        return z.NEVER;
      }

      const scheduledPublishAt = ukInstant({
        ...date,
        hour: Number(answers.publishingTimeHour),
        minute: Number(answers.publishingTimeMinute),
      });

      if (scheduledPublishAt === null) {
        addIssues(ctx, ['publishingTimeHour', 'publishingTimeMinute'], REAL_PUBLISHING_TIME);
        return z.NEVER;
      }

      return { ...answers, scheduledPublishAt };
    }),
  };
}

/** The form's schema, then that every source is one the providers list offers. */
export function providerSourcesServerSection(
  section: ProviderSourcesSection,
  dataProviders: InternalDataProviderRepository,
): ProviderSourcesSection {
  return {
    ...section,
    schema: section.schema.transform(async (answers, ctx) => {
      if (areProviderSourcesOffered(answers.sources, await dataProviders.list())) return answers;

      ctx.addIssue({ code: 'custom', path: ['sources'], message: SELECT_DATA_PROVIDER });
      return z.NEVER;
    }),
  };
}
