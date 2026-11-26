import { z } from '@fphd/config/zod';
import { ukDaysUntil, ukInstant } from '@fphd/utils/uk-time';

import {
  addIssues,
  CALCULATION_PART_FIELDS,
  type Calculation,
  type CalculationField,
  type CalculationValueType,
  CI_METHOD_NO_LONGER_OFFERED,
  type ConfidenceIntervalsField,
  calculationSectionFor,
  confidenceIntervalsSection,
  confidenceIntervalsSectionFor,
  type FormatAndSourcesSection,
  FUTURE_PUBLISHING_DATE,
  isProviderSourceOffered,
  PUBLISHING_DATE_FIELDS,
  PUBLISHING_NOTICE_DAYS,
  PUBLISHING_NOTICE_WEEKS,
  type PublishingDateField,
  publishingDateSection,
  REAL_PUBLISHING_TIME,
  SELECT_VALUE_TYPE,
  SOURCE_NO_LONGER_OFFERED,
  subtopicRequiredMessage,
  subtopicsOf,
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
import type { IndicatorSectionDraftContext } from './indicator-section.ts';
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

/**
 * The form's schema, then that every tag asked for is one the page offers under its question,
 * that each subtopic is under a topic added, and that each topic with subtopics has one.
 */
export function taggingServerSection(
  tags: InternalTagRepository,
): IndicatorSection<TaggingField, Tagging, TaggingFormValues, TaggingField, TaggingAnswers> {
  return {
    ...taggingSection,
    schema: taggingSection.schema.transform(async (answers, ctx) => {
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
      const withoutSubtopic = options.topics.find(
        ({ id }) =>
          answers.topicIds.includes(id) &&
          subtopicsOf(options, id).length > 0 &&
          !selectedSubtopics.some(({ topicId }) => topicId === id),
      );
      if (withoutSubtopic !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['subtopicIds'],
          message: subtopicRequiredMessage(withoutSubtopic),
        });
        refused = true;
      }

      return refused ? z.NEVER : answers;
    }),
  };
}

/**
 * The calculation, judged with the draft's value type, which its GET returns beside the answers
 * so the page asks what that value type asks.
 */
export const calculationDraftContext: IndicatorSectionDraftContext<
  { valueType: CalculationValueType | null },
  CalculationField,
  Calculation,
  Record<CalculationField, string>,
  CalculationField,
  Record<CalculationField, string | null>
> = {
  contextOf: ({ draft, draftValueTypeName }) => ({
    valueType:
      draft.valueTypeId === null || draftValueTypeName === null
        ? null
        : { id: draft.valueTypeId, name: draftValueTypeName },
  }),
  sectionFor: ({ valueType }) => calculationSectionFor(valueType?.id ?? null),
};

/**
 * The form's schema, then the requirements of the chosen method, read from its row. A method the
 * list no longer holds is refused with a message asking the publisher to choose another.
 */
export function confidenceIntervalsServerSection(
  ciMethods: InternalCiMethodRepository,
): IndicatorSection<ConfidenceIntervalsField, ConfidenceIntervalsWithKind> {
  return {
    ...confidenceIntervalsSection,
    schema: confidenceIntervalsSection.schema.transform(async (answers, ctx) => {
      const kind = (await ciMethods.findById(answers.ciMethodId))?.kind ?? null;

      if (kind === null) {
        ctx.addIssue({
          code: 'custom',
          path: ['ciMethodId'],
          message: CI_METHOD_NO_LONGER_OFFERED,
        });
        return z.NEVER;
      }

      const checked = confidenceIntervalsSectionFor(kind).schema.safeParse(answers);

      if (checked.success) return { ...checked.data, kind };

      for (const { path, message } of checked.error?.issues ?? []) {
        ctx.addIssue({ code: 'custom', path, message });
      }
      return z.NEVER;
    }),
  };
}

/** The form's schema, then that the value type is one the page offers. */
export function valueTypeAndUnitsServerSection(
  valueTypesAndUnits: InternalValueTypeAndUnitRepository,
): IndicatorSection<ValueTypeAndUnitsField, ValueTypeAndUnits> {
  return {
    ...valueTypeAndUnitsSection,
    schema: valueTypeAndUnitsSection.schema.transform(async (answers, ctx) => {
      const { valueTypes } = await valueTypesAndUnits.listOptions();

      if (!valueTypes.some(({ id }) => id === answers.valueTypeId)) {
        ctx.addIssue({ code: 'custom', path: ['valueTypeId'], message: SELECT_VALUE_TYPE });
        return z.NEVER;
      }
      return answers;
    }),
  };
}

/**
 * The form's schema, then the instant the answers name, which must exist in UK time. The date
 * must be at least the notice period after today's in the UK, whatever the time. A fast-tracked
 * indicator skips the notice, but its date and time must still be in the future.
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
      const fastTracked = answers.fastTracked === 'yes';

      if (!fastTracked && ukDaysUntil(now(), date) < PUBLISHING_NOTICE_DAYS) {
        addIssues(
          ctx,
          PUBLISHING_DATE_FIELDS,
          `Publishing date and time must be at least ${PUBLISHING_NOTICE_WEEKS} weeks in the future`,
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

      if (fastTracked && scheduledPublishAt <= now()) {
        addIssues(ctx, PUBLISHING_DATE_FIELDS, FUTURE_PUBLISHING_DATE);
        return z.NEVER;
      }

      return { ...answers, scheduledPublishAt };
    }),
  };
}

/** The form's schema, then that every source the chosen branch keeps is one still offered. */
export function formatAndSourcesServerSection(
  section: FormatAndSourcesSection,
  dataProviders: InternalDataProviderRepository,
): FormatAndSourcesSection {
  return {
    ...section,
    schema: section.schema.transform(async (answers, ctx) => {
      const providers = await dataProviders.list();
      const lists: [
        (string | number)[],
        readonly { providerId: string; sourceId: string | null }[],
      ][] =
        answers.hasNumeratorDenominator === 'yes'
          ? (['numerator', 'denominator'] as const).map((part) => {
              const field = CALCULATION_PART_FIELDS[part].sources;
              return [[field], answers[field]];
            })
          : answers.dataValues.map(({ sources }, index) => [
              ['dataValues', index, 'sources'],
              sources,
            ]);
      let refused = false;

      for (const [path, sources] of lists) {
        if (sources.some((source) => !isProviderSourceOffered(source, providers))) {
          ctx.addIssue({ code: 'custom', path, message: SOURCE_NO_LONGER_OFFERED });
          refused = true;
        }
      }

      return refused ? z.NEVER : answers;
    }),
  };
}
