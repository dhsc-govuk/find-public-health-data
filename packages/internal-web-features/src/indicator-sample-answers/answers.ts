import {
  benchmarkingSection,
  type CiMethod,
  calculationSection,
  confidenceIntervalsSection,
  copyrightAndDataReuseSection,
  type DataProvider,
  dataQualitySection,
  definitionAndRationaleSection,
  denominatorSection,
  type IndicatorSection,
  type IndicatorTaskKey,
  indicatorSectionAnswersSchema,
  indicatorSectionErrorSchema,
  justificationsSection,
  linksAnswersSchema,
  linksSection,
  numeratorSection,
  otherCommentsSection,
  otherNotesAndCaveatsSection,
  periodTypeSection,
  polaritySection,
  providerSourcesAnswersSchema,
  publishingDateSection,
  sexAndAgesAnswersSchema,
  sexAndAgesSection,
  type TagOptions,
  taggingAnswersSchema,
  taggingSection,
  updateFrequencySection,
  type ValueTypeAndUnitOptions,
  valueTypeAndUnitsSection,
  varianceAndQualitySection,
} from '@fphd/internal-api-features/contract';
import type { ApiResponseSchema } from '@fphd/web-server/api-client';

/** A one-row table for England, which the check page accepts. */
export const SAMPLE_DATA_TABLE = [
  'area_code,period_start,period_end,value',
  'E92000001,2019-04-01,2020-03-31,83.8',
].join('\n');

/** The choices the sample answers pick from, as the API offers them to the section pages. */
export interface SampleAnswerOptions {
  valueTypesAndUnits: ValueTypeAndUnitOptions;
  ciMethods: readonly CiMethod[];
  dataProviders: readonly DataProvider[];
  tags: TagOptions;
}

/** One section's sample answers, and the schemas its page saves them with. */
export interface SampleAnswer {
  key: IndicatorTaskKey;
  answers: unknown;
  /** The section's own schema, which the answers pass before they are sent. */
  schema: ApiResponseSchema<unknown>;
  /** The section's answers as the API returns them. */
  answersSchema: ApiResponseSchema<unknown>;
  errorSchema: ApiResponseSchema<{ error: string }>;
}

function sample<Field extends string, Values, Input, ErrorField extends string, Answers>(
  section: IndicatorSection<Field, Values, Input, ErrorField, Answers>,
  answers: NoInfer<Input>,
  answersSchema: ApiResponseSchema<unknown> = indicatorSectionAnswersSchema(section.fields),
): SampleAnswer {
  return {
    key: section.key,
    answers,
    schema: section.schema,
    answersSchema,
    errorSchema: indicatorSectionErrorSchema(section),
  };
}

/** A text section's answers, every field the sample leaves out answered blank. */
function text<Field extends string, Values, ErrorField extends string, Answers>(
  section: IndicatorSection<Field, Values, Record<Field, string>, ErrorField, Answers>,
  answers: Partial<Record<NoInfer<Field>, string>>,
): SampleAnswer {
  const blank = Object.fromEntries(section.fields.options.map((field) => [field, '']));

  return sample(section, { ...blank, ...answers } as Record<Field, string>);
}

function named<Option extends { name: string }>(
  options: readonly Option[],
  name: string,
  what: string,
): Option {
  const option = options.find((candidate) => candidate.name === name);

  if (option === undefined) throw new Error(`The API offers no ${what} named ${name}`);
  return option;
}

function first<Option>(options: readonly Option[], what: string): Option {
  const [option] = options;

  if (option === undefined) throw new Error(`The API offers no ${what}`);
  return option;
}

/**
 * Answers to every section but the name and the data table, as a publisher could give them, in
 * task list order. The publishing date is 1 April of the year after `now`'s.
 */
export function sampleAnswers(options: SampleAnswerOptions, now: Date): SampleAnswer[] {
  const { valueTypesAndUnits, ciMethods, dataProviders, tags } = options;
  const sources = [{ providerId: first(dataProviders, 'data provider').id, sourceId: null }];
  const topicId = first(tags.topics, 'topic').id;

  return [
    text(valueTypeAndUnitsSection, {
      valueTypeId: named(valueTypesAndUnits.valueTypes, 'Count', 'value type').id,
      unitId: named(valueTypesAndUnits.units, 'per 100', 'unit').id,
    }),
    sample(
      sexAndAgesSection,
      {
        sexes: ['persons'],
        ageType: 'all',
        ageRanges: [],
        specificAge: '',
        specificAgeUnit: '',
        ageDetail: '',
      },
      sexAndAgesAnswersSchema,
    ),
    text(periodTypeSection, { periodType: 'years', yearType: 'financial' }),
    text(polaritySection, { polarity: 'lower-is-better' }),
    text(dataQualitySection, { hasDataQualityIssues: 'no' }),
    text(definitionAndRationaleSection, {
      definition: 'A sample definition.',
      rationale: 'A sample rationale.',
    }),
    sample(
      numeratorSection,
      { sources, definition: 'Sample numerator.' },
      providerSourcesAnswersSchema,
    ),
    sample(
      denominatorSection,
      { sources, definition: 'Sample denominator.' },
      providerSourcesAnswersSchema,
    ),
    text(calculationSection, { methodology: 'A sample method.', calculatedBy: 'ohid' }),
    text(confidenceIntervalsSection, {
      ciMethodId: named(ciMethods, "Byar's method", 'confidence interval method').id,
      hasCiMethodModifications: 'no',
    }),
    text(benchmarkingSection, { hasGoalBenchmark: 'no' }),
    text(otherNotesAndCaveatsSection, {
      disclosureControl: 'not-applicable',
      hasRounding: 'no',
      hasCaveats: 'no',
      hasOtherNotes: 'no',
    }),
    sample(linksSection, { hasLinks: 'no', links: [] }, linksAnswersSchema),
    sample(
      taggingSection,
      {
        topicIds: [topicId],
        primaryTopicId: topicId,
        subtopicIds: [],
        primarySubtopicId: '',
        indicatorTypeIds: [first(tags.indicatorTypes, 'indicator type').id],
        hasLifeStage: 'no',
        lifeStageIds: [],
        hasFramework: 'no',
        frameworkIds: [],
      },
      taggingAnswersSchema,
    ),
    text(copyrightAndDataReuseSection, { hasCustomCopyright: 'no', hasCustomDataReuse: 'no' }),
    text(updateFrequencySection, { updateFrequency: 'annually' }),
    text(publishingDateSection, {
      publishingDateDay: '1',
      publishingDateMonth: '4',
      publishingDateYear: String(now.getFullYear() + 1),
      publishingTimeHour: '09',
      publishingTimeMinute: '30',
    }),
    text(varianceAndQualitySection, {
      variation: 'Little.',
      qualityAssurance: 'Checked.',
      hasSourceDataIssues: 'no',
    }),
    text(justificationsSection, {
      ciMethodJustification: 'Standard.',
      dataSourcesJustification: 'The best available.',
      inequalitiesIncluded: 'Deprivation.',
      hasExclusions: 'no',
      hasAutomation: 'no',
    }),
    text(otherCommentsSection, { hasReviewerComments: 'no' }),
  ];
}
