import { z } from '@fphd/config/zod';
import { INDICATOR_DISCLOSURE_CONTROL } from '@fphd/utils/disclosure-control';
import type { IndicatorCalculationPart } from '@fphd/utils/source-part';

import type { IndicatorSection } from './indicator-section-contract.ts';
import { longText } from './text-contract.ts';

const namedSchema = z.object({ id: z.uuid(), name: z.string().min(1) });

/** A provider of data, and the sources it offers, which a publisher may also leave unnamed. */
export const dataProviderSchema = namedSchema.extend({ sources: z.array(namedSchema) });

/** Every provider a publisher may choose, in the order the form lists them. */
export const dataProviderListSchema = z.array(dataProviderSchema);

export type DataProvider = z.infer<typeof dataProviderSchema>;

export type { IndicatorCalculationPart };

export const MAX_PROVIDER_SOURCES = 20;

export const MAX_DATA_VALUES = 20;

/** A provider, and the source of its data, or null where there is no specific source. */
export const providerSourceSchema = z.object({
  providerId: z.uuid(),
  sourceId: z.uuid().nullable(),
});

export type ProviderSource = z.infer<typeof providerSourceSchema>;

const sameProviderSource = (a: ProviderSource, b: ProviderSource) =>
  a.providerId === b.providerId && a.sourceId === b.sourceId;

/**
 * A figure the page asks about, as its messages name it: "the numerator", "the denominator" or
 * "data value 2". The data values are numbered from 1, even when there is only one, as their
 * labels are.
 */
export type Figure = IndicatorCalculationPart | { dataValue: number };

export function figureName(figure: Figure): string {
  return typeof figure === 'string' ? `the ${figure}` : `data value ${figure.dataValue + 1}`;
}

/** Why a figure's list of sources is refused, if it is. */
export function sourceListProblem(
  sources: readonly ProviderSource[],
  figure: Figure,
): string | undefined {
  if (sources.length === 0) return `Add at least one data source for ${figureName(figure)}`;
  if (sources.length > MAX_PROVIDER_SOURCES) {
    return `You cannot add more than ${MAX_PROVIDER_SOURCES} data sources`;
  }
  if (
    sources.some(
      (source, index) => sources.findIndex((other) => sameProviderSource(source, other)) !== index,
    )
  ) {
    return 'Select a source that has not already been added';
  }
  return undefined;
}

function definitionRequired(figure: Figure): string {
  return typeof figure === 'string'
    ? `Enter the ${figure} definition`
    : `Enter the definition for ${figureName(figure)}`;
}

function disclosureControlRequired(figure: Figure): string {
  return `Select whether disclosure control has been applied to ${figureName(figure)}`;
}

function disclosureControlDetailRequired(figure: Figure): string {
  return `Provide details of the disclosure control applied to ${figureName(figure)}`;
}

/** The figure a refused disclosure control answer belongs to, from where it is in the answers. */
function figureAt(path: readonly PropertyKey[] | undefined): Figure {
  const [field, index] = path ?? [];
  if (field === 'dataValues' && typeof index === 'number') return { dataValue: index };
  return field === 'denominatorDisclosureControl' ? 'denominator' : 'numerator';
}

/** Whether disclosure control was applied, or nothing until it is answered. */
const disclosureControl = z.enum(['', ...INDICATOR_DISCLOSURE_CONTROL], {
  error: ({ path }) => disclosureControlRequired(figureAt(path)),
});

const fields = z.enum([
  'hasNumeratorDenominator',
  'numeratorSources',
  'numeratorDefinition',
  'numeratorDisclosureControl',
  'numeratorDisclosureControlDetail',
  'denominatorSources',
  'denominatorDefinition',
  'denominatorDisclosureControl',
  'denominatorDisclosureControlDetail',
  'dataValues',
]);

export type FormatAndSourcesField = z.infer<typeof fields>;

/** The parts of one data value, each named as its control is and as its refusal is keyed. */
export const DATA_VALUE_PARTS = [
  'sources',
  'definition',
  'disclosureControl',
  'disclosureControlDetail',
] as const;

export type DataValuePart = (typeof DATA_VALUE_PARTS)[number];

export type DataValueField = `dataValues[${number}].${DataValuePart}`;

export function dataValueFieldName<Part extends string>(
  index: number,
  part: Part,
): `dataValues[${number}].${Part}` {
  return `dataValues[${index}].${part}`;
}

/** One data value as the form holds it: its sources added so far, and its answers as text. */
export interface DataValueFormValues {
  sources: ProviderSource[];
  definition: string;
  disclosureControl: string;
  disclosureControlDetail: string;
}

/** The answers as the form holds them. */
export interface FormatAndSourcesFormValues {
  hasNumeratorDenominator: string;
  numeratorSources: ProviderSource[];
  numeratorDefinition: string;
  numeratorDisclosureControl: string;
  numeratorDisclosureControlDetail: string;
  denominatorSources: ProviderSource[];
  denominatorDefinition: string;
  denominatorDisclosureControl: string;
  denominatorDisclosureControlDetail: string;
  dataValues: DataValueFormValues[];
}

/** The fields of the numerator or the denominator, by the part of the figure each holds. */
export const CALCULATION_PART_FIELDS = {
  numerator: {
    sources: 'numeratorSources',
    definition: 'numeratorDefinition',
    disclosureControl: 'numeratorDisclosureControl',
    disclosureControlDetail: 'numeratorDisclosureControlDetail',
  },
  denominator: {
    sources: 'denominatorSources',
    definition: 'denominatorDefinition',
    disclosureControl: 'denominatorDisclosureControl',
    disclosureControlDetail: 'denominatorDisclosureControlDetail',
  },
} as const satisfies Record<IndicatorCalculationPart, Record<DataValuePart, FormatAndSourcesField>>;

const dataValue = z.object({
  sources: z.array(providerSourceSchema),
  definition: longText('Data value definition'),
  disclosureControl,
  disclosureControlDetail: longText('Details of the disclosure control'),
});

/** Why one figure's answers are refused, keyed by the part at fault. */
function figureProblems(
  answers: z.infer<typeof dataValue>,
  figure: Figure,
): Partial<Record<DataValuePart, string>> {
  const problems: Partial<Record<DataValuePart, string>> = {};
  const sources = sourceListProblem(answers.sources, figure);

  if (sources !== undefined) problems.sources = sources;
  if (answers.definition === '') problems.definition = definitionRequired(figure);
  if (answers.disclosureControl === '') {
    problems.disclosureControl = disclosureControlRequired(figure);
  }
  if (answers.disclosureControl === 'yes' && answers.disclosureControlDetail === '') {
    problems.disclosureControlDetail = disclosureControlDetailRequired(figure);
  }

  return problems;
}

const schema = z
  .object({
    hasNumeratorDenominator: z.enum(['yes', 'no'], {
      error: 'Select whether this indicator has a numerator and denominator',
    }),
    numeratorSources: z.array(providerSourceSchema),
    numeratorDefinition: longText('Numerator definition'),
    numeratorDisclosureControl: disclosureControl,
    numeratorDisclosureControlDetail: longText(
      'Details of the disclosure control applied to the numerator',
    ),
    denominatorSources: z.array(providerSourceSchema),
    denominatorDefinition: longText('Denominator definition'),
    denominatorDisclosureControl: disclosureControl,
    denominatorDisclosureControlDetail: longText(
      'Details of the disclosure control applied to the denominator',
    ),
    dataValues: z
      .array(dataValue)
      .max(MAX_DATA_VALUES, `You cannot add more than ${MAX_DATA_VALUES} data values`),
  })
  .superRefine(
    (answers, ctx) => {
      const issue = (path: (string | number)[], message: string) =>
        ctx.addIssue({ code: 'custom', path, message });

      if (answers.hasNumeratorDenominator === 'yes') {
        for (const part of ['numerator', 'denominator'] as const) {
          const names = CALCULATION_PART_FIELDS[part];
          const problems = figureProblems(
            {
              sources: answers[names.sources],
              definition: answers[names.definition],
              disclosureControl: answers[names.disclosureControl],
              disclosureControlDetail: answers[names.disclosureControlDetail],
            },
            part,
          );

          for (const [figurePart, message] of Object.entries(problems)) {
            issue([names[figurePart as DataValuePart]], message);
          }
        }
      }

      if (answers.hasNumeratorDenominator === 'no') {
        // The page always shows a data value, so none sent is refused where the first one goes.
        if (answers.dataValues.length === 0) {
          issue(['dataValues', 0, 'sources'], sourceListProblem([], { dataValue: 0 }) ?? '');
        }

        for (const [index, row] of answers.dataValues.entries()) {
          for (const [part, message] of Object.entries(figureProblems(row, { dataValue: index }))) {
            issue(['dataValues', index, part], message);
          }
        }
      }
    },
    // Also beside refused text or an unanswered question, so every refusal shows at once.
    { when: ({ issues }) => issues.every(({ code }) => code !== 'invalid_type') },
  );

export type FormatAndSources = z.infer<typeof schema>;

/** The page's fields: a data value's are named by its row. */
export type FormatAndSourcesPageField = FormatAndSourcesField | DataValueField;

const errorFields = z.union([
  fields,
  z.templateLiteral(['dataValues[', z.number().int().min(0), '].', z.enum(DATA_VALUE_PARTS)]),
]);

const storedDisclosureControl = z.enum(INDICATOR_DISCLOSURE_CONTROL).nullable();

/** The draft's answers: null or empty until answered. */
export const formatAndSourcesAnswersSchema = z.object({
  hasNumeratorDenominator: z.enum(['yes', 'no']).nullable(),
  numeratorSources: z.array(providerSourceSchema),
  numeratorDefinition: z.string().nullable(),
  numeratorDisclosureControl: storedDisclosureControl,
  numeratorDisclosureControlDetail: z.string().nullable(),
  denominatorSources: z.array(providerSourceSchema),
  denominatorDefinition: z.string().nullable(),
  denominatorDisclosureControl: storedDisclosureControl,
  denominatorDisclosureControlDetail: z.string().nullable(),
  dataValues: z.array(
    z.object({
      sources: z.array(providerSourceSchema),
      definition: z.string().nullable(),
      disclosureControl: storedDisclosureControl,
      disclosureControlDetail: z.string().nullable(),
    }),
  ),
});

export type FormatAndSourcesAnswers = z.infer<typeof formatAndSourcesAnswersSchema>;

const text = (value: string | null): string => value ?? '';

export type FormatAndSourcesSection = IndicatorSection<
  FormatAndSourcesField,
  FormatAndSources,
  FormatAndSourcesFormValues,
  FormatAndSourcesPageField,
  FormatAndSourcesAnswers
>;

export const formatAndSourcesSection: FormatAndSourcesSection = {
  key: 'format-and-sources',
  fields,
  schema,
  errorFields,
  formValues: (answers) => ({
    hasNumeratorDenominator: text(answers.hasNumeratorDenominator),
    numeratorSources: answers.numeratorSources,
    numeratorDefinition: text(answers.numeratorDefinition),
    numeratorDisclosureControl: text(answers.numeratorDisclosureControl),
    numeratorDisclosureControlDetail: text(answers.numeratorDisclosureControlDetail),
    denominatorSources: answers.denominatorSources,
    denominatorDefinition: text(answers.denominatorDefinition),
    denominatorDisclosureControl: text(answers.denominatorDisclosureControl),
    denominatorDisclosureControlDetail: text(answers.denominatorDisclosureControlDetail),
    dataValues: answers.dataValues.map((row) => ({
      sources: row.sources,
      definition: text(row.definition),
      disclosureControl: text(row.disclosureControl),
      disclosureControlDetail: text(row.disclosureControlDetail),
    })),
  }),
};

/** The figures whose sources the page holds: the numerator and denominator, and every data value. */
export function sourceListsOf(values: FormatAndSourcesFormValues): ProviderSource[][] {
  return [
    values.numeratorSources,
    values.denominatorSources,
    ...values.dataValues.map(({ sources }) => sources),
  ];
}

/** The select's value for a provider chosen with no specific source. */
export const NO_SPECIFIC_SOURCE = 'none';

/** The two selects that add a provider and source to a list, as chosen. */
export interface NewProviderSourceFormValues {
  providerId: string;
  sourceId: string;
}

export type NewProviderSourceField = keyof NewProviderSourceFormValues;

export const SELECT_DATA_PROVIDER = 'Select a data provider';

/**
 * The list with the chosen provider and source added at its end, or why they were refused.
 * The choice is checked against the providers offered, which the form's selects only ever
 * send. A refusal of the list itself, such as a repeat, is reported against the source.
 */
export function addProviderSource(
  figure: Figure,
  sources: readonly ProviderSource[],
  { providerId, sourceId }: NewProviderSourceFormValues,
  providers: readonly DataProvider[],
):
  | { sources: ProviderSource[] }
  | { fieldErrors: Partial<Record<NewProviderSourceField, string>> } {
  const provider = providers.find(({ id }) => id === providerId);

  if (provider === undefined) return { fieldErrors: { providerId: SELECT_DATA_PROVIDER } };

  const source = provider.sources.find(({ id }) => id === sourceId);

  if (sourceId !== NO_SPECIFIC_SOURCE && source === undefined) {
    return { fieldErrors: { sourceId: 'Select a source, or No specific source' } };
  }

  const added = [...sources, { providerId, sourceId: source?.id ?? null }];
  const problem = sourceListProblem(added, figure);

  return problem === undefined ? { sources: added } : { fieldErrors: { sourceId: problem } };
}

/** Whether the source names a provider offered and, where named, one of its sources. */
export function isProviderSourceOffered(
  { providerId, sourceId }: ProviderSource,
  providers: readonly DataProvider[],
): boolean {
  const provider = providers.find(({ id }) => id === providerId);

  return (
    provider !== undefined &&
    (sourceId === null || provider.sources.some(({ id }) => id === sourceId))
  );
}

/** Whether every source names a provider offered and, where named, one of its sources. */
export function areProviderSourcesOffered(
  sources: readonly ProviderSource[],
  providers: readonly DataProvider[],
): boolean {
  return sources.every((source) => isProviderSourceOffered(source, providers));
}

/** The message on a figure's sources when one it holds is no longer offered. */
export const SOURCE_NO_LONGER_OFFERED =
  'Remove the data source that is no longer available, then add another if you need one';

/** Shown in place of a source that is no longer offered, which has no name to show. */
export const SOURCE_NOT_OFFERED_LABEL = 'Data source no longer available';

/**
 * A provider alone where there is no specific source, as the public page shows it too. A source
 * that is no longer offered reads as such, so the publisher can see it and remove it.
 */
export function providerSourceLabel(
  source: ProviderSource,
  providers: readonly DataProvider[],
): string {
  const provider = providers.find(({ id }) => id === source.providerId);

  if (provider === undefined || !isProviderSourceOffered(source, providers)) {
    return SOURCE_NOT_OFFERED_LABEL;
  }

  const named = provider.sources.find(({ id }) => id === source.sourceId);

  return named === undefined ? provider.name : `${provider.name}: ${named.name}`;
}
