import {
  addProviderSource,
  CALCULATION_PART_FIELDS,
  type DataProvider,
  type DataValueFormValues,
  type DataValuePart,
  dataValueFieldName,
  type Figure,
  type FormatAndSourcesFormValues,
  type FormatAndSourcesPageField,
  type FormatAndSourcesSection,
  type IndicatorCalculationPart,
  isProviderSourceOffered,
  MAX_DATA_VALUES,
  type NewProviderSourceField,
  type NewProviderSourceFormValues,
  type ProviderSource,
  providerSourceSchema,
  SELECT_DATA_PROVIDER,
  SOURCE_NO_LONGER_OFFERED,
  toFieldErrors,
} from '@fphd/internal-api-features/contract';

import { readFormValues } from '../form-values.ts';
import type { FormFailure, SectionAnswers } from '../indicator-section.ts';
import { readListItems } from '../list-form.ts';

/**
 * Where a list of sources is on the page: under the numerator, under the denominator, or under
 * the data value at that index.
 */
export type SourcePicker = IndicatorCalculationPart | number;

/** One data value as the page holds it: its answers, and the two selects that add a source. */
export type DataValuePageValues = DataValueFormValues & NewProviderSourceFormValues;

/** The page's answers, the sources added so far, and the selects that add another to each list. */
export type FormatAndSourcesPageValues = Omit<FormatAndSourcesFormValues, 'dataValues'> & {
  numeratorProviderId: string;
  numeratorSourceId: string;
  denominatorProviderId: string;
  denominatorSourceId: string;
  dataValues: DataValuePageValues[];
};

/** A field of the page: the section's, and each picker's two selects. */
export type FormatAndSourcesPageFormField =
  | FormatAndSourcesPageField
  | `${IndicatorCalculationPart}${'ProviderId' | 'SourceId'}`
  | `dataValues[${number}].${NewProviderSourceField}`;

/** The page as the action re-renders it: after a refusal, or with a list or a select changed. */
export type FormatAndSourcesPageState = FormFailure<
  FormatAndSourcesPageFormField,
  FormatAndSourcesPageValues
>;

type FieldErrors = Partial<Record<FormatAndSourcesPageFormField, string>>;

/** The names of a picker's list and its two selects, as its controls and errors are named. */
export function pickerFields(picker: SourcePicker): {
  sources: FormatAndSourcesPageFormField;
  providerId: FormatAndSourcesPageFormField;
  sourceId: FormatAndSourcesPageFormField;
} {
  if (typeof picker === 'number') {
    return {
      sources: dataValueFieldName(picker, 'sources'),
      providerId: dataValueFieldName(picker, 'providerId'),
      sourceId: dataValueFieldName(picker, 'sourceId'),
    };
  }
  return {
    sources: CALCULATION_PART_FIELDS[picker].sources,
    providerId: `${picker}ProviderId`,
    sourceId: `${picker}SourceId`,
  };
}

/** The figure a picker's sources are for, as the messages name it. */
export function figureOf(picker: SourcePicker): Figure {
  return typeof picker === 'number' ? { dataValue: picker } : picker;
}

/** The name of the hidden field holding one part of the source at `index` of a picker's list. */
export function sourceFieldName(
  picker: SourcePicker,
  index: number,
  part: keyof ProviderSource,
): string {
  return `${pickerFields(picker).sources}[${index}].${part}`;
}

export function sourcesOf(values: FormatAndSourcesPageValues, picker: SourcePicker) {
  return typeof picker === 'number'
    ? (values.dataValues[picker]?.sources ?? [])
    : values[CALCULATION_PART_FIELDS[picker].sources];
}

export function choiceOf(
  values: FormatAndSourcesPageValues,
  picker: SourcePicker,
): NewProviderSourceFormValues {
  if (typeof picker === 'number') {
    const { providerId = '', sourceId = '' } = values.dataValues[picker] ?? {};
    return { providerId, sourceId };
  }
  return { providerId: values[`${picker}ProviderId`], sourceId: values[`${picker}SourceId`] };
}

/** The values with the picker's list and selects changed. */
function withPicker(
  values: FormatAndSourcesPageValues,
  picker: SourcePicker,
  sources: ProviderSource[],
  { providerId, sourceId }: NewProviderSourceFormValues,
): FormatAndSourcesPageValues {
  if (typeof picker === 'number') {
    return {
      ...values,
      dataValues: values.dataValues.map((row, index) =>
        index === picker ? { ...row, sources, providerId, sourceId } : row,
      ),
    };
  }
  return {
    ...values,
    [CALCULATION_PART_FIELDS[picker].sources]: sources,
    [`${picker}ProviderId`]: providerId,
    [`${picker}SourceId`]: sourceId,
  };
}

/** Every picker the page shows: the numerator's, the denominator's, and each data value's. */
function pickersOf(values: FormatAndSourcesPageValues): SourcePicker[] {
  return ['numerator', 'denominator', ...values.dataValues.map((_, index) => index)];
}

/** The pickers whose lists the answer to the first question keeps. */
function keptPickers(values: FormatAndSourcesPageValues): SourcePicker[] {
  if (values.hasNumeratorDenominator === 'yes') return ['numerator', 'denominator'];
  if (values.hasNumeratorDenominator === 'no') return values.dataValues.map((_, index) => index);
  return [];
}

const BLANK_DATA_VALUE: DataValuePageValues = {
  sources: [],
  definition: '',
  disclosureControl: '',
  disclosureControlDetail: '',
  providerId: '',
  sourceId: '',
};

/** The answers with a blank data value if they hold none, as the page always offers one. */
export function withDataValueShown(values: FormatAndSourcesPageValues): FormatAndSourcesPageValues {
  return values.dataValues.length > 0 ? values : { ...values, dataValues: [BLANK_DATA_VALUE] };
}

/** The draft's answers as the page holds them, with nothing chosen in any select. */
export function pageValuesOf(answers: FormatAndSourcesFormValues): FormatAndSourcesPageValues {
  return withDataValueShown({
    ...answers,
    numeratorProviderId: '',
    numeratorSourceId: '',
    denominatorProviderId: '',
    denominatorSourceId: '',
    dataValues: answers.dataValues.map((row) => ({ ...row, providerId: '', sourceId: '' })),
  });
}

/** The message on each of the lists holding a source the providers list no longer offers. */
export function sourcesNoLongerOffered(
  values: FormatAndSourcesPageValues,
  providers: readonly DataProvider[],
  pickers: readonly SourcePicker[] = pickersOf(values),
): FieldErrors {
  return Object.fromEntries(
    pickers
      .filter((picker) =>
        sourcesOf(values, picker).some((source) => !isProviderSourceOffered(source, providers)),
      )
      .map((picker) => [pickerFields(picker).sources, SOURCE_NO_LONGER_OFFERED]),
  );
}

/** The button that sent the form. Continue, which has no name, is any other. */
export type FormatAndSourcesIntent =
  | { to: 'show-sources'; picker: SourcePicker }
  | { to: 'add-source'; picker: SourcePicker }
  | { to: 'remove-source'; picker: SourcePicker; index: number }
  | { to: 'add-data-value' }
  | { to: 'remove-data-value'; index: number }
  | { to: 'continue' };

const PICKER = '(numerator|denominator|\\d+)';
const PICKER_INTENT = new RegExp(`^(show-sources|add-source)-${PICKER}$`);
const REMOVE_SOURCE_INTENT = new RegExp(`^remove-source-${PICKER}-(\\d+)$`);
const REMOVE_DATA_VALUE_INTENT = /^remove-data-value-(\d+)$/;

/** The value of the button that offers a picker's provider's sources without JavaScript. */
export function showSourcesIntent(picker: SourcePicker): string {
  return `show-sources-${picker}`;
}

export function addSourceIntent(picker: SourcePicker): string {
  return `add-source-${picker}`;
}

export function removeSourceIntent(picker: SourcePicker, index: number): string {
  return `remove-source-${picker}-${index}`;
}

export const ADD_DATA_VALUE_INTENT = 'add-data-value';

export function removeDataValueIntent(index: number): string {
  return `remove-data-value-${index}`;
}

function readPicker(text: string): SourcePicker {
  return text === 'numerator' || text === 'denominator' ? text : Number(text);
}

export function readIntent(formData: FormData): FormatAndSourcesIntent {
  const intent = formData.get('intent');
  if (typeof intent !== 'string') return { to: 'continue' };
  if (intent === ADD_DATA_VALUE_INTENT) return { to: 'add-data-value' };

  const pickerIntent = PICKER_INTENT.exec(intent);
  if (pickerIntent?.[1] !== undefined && pickerIntent[2] !== undefined) {
    const to = pickerIntent[1] === 'show-sources' ? 'show-sources' : 'add-source';
    return { to, picker: readPicker(pickerIntent[2]) };
  }

  const removeSource = REMOVE_SOURCE_INTENT.exec(intent);
  if (removeSource?.[1] !== undefined && removeSource[2] !== undefined) {
    return {
      to: 'remove-source',
      picker: readPicker(removeSource[1]),
      index: Number(removeSource[2]),
    };
  }

  const removeDataValue = REMOVE_DATA_VALUE_INTENT.exec(intent);
  if (removeDataValue?.[1] !== undefined) {
    return { to: 'remove-data-value', index: Number(removeDataValue[1]) };
  }

  return { to: 'continue' };
}

/**
 * The sources a picker's list carries, where an empty source is none specific. The page only
 * ever writes ones in the right shape, so one in any other was not sent by it, and the request
 * is refused whole. One the providers list no longer offers is kept, so the page can ask for it
 * to be removed.
 */
function readSources(formData: FormData, picker: SourcePicker): ProviderSource[] {
  return readListItems(formData, ['providerId', 'sourceId'], (index, part) =>
    sourceFieldName(picker, index, part),
  ).map(({ providerId, sourceId }) => {
    const source = providerSourceSchema.safeParse({
      providerId,
      sourceId: sourceId === '' ? null : sourceId,
    });

    if (!source.success) throw new Response('Bad Request', { status: 400 });

    return source.data;
  });
}

const DATA_VALUE_TEXT_PARTS = [
  'definition',
  'disclosureControl',
  'disclosureControlDetail',
  'providerId',
  'sourceId',
] as const satisfies readonly (DataValuePart | NewProviderSourceField)[];

/** The form as sent, and which of its buttons sent it; a field not sent is empty. */
export function readFormatAndSourcesForm(formData: FormData): {
  values: FormatAndSourcesPageValues;
  intent: FormatAndSourcesIntent;
} {
  const dataValues = readListItems(formData, DATA_VALUE_TEXT_PARTS, dataValueFieldName).map(
    (row, index) => ({ ...row, sources: readSources(formData, index) }),
  );

  return {
    values: withDataValueShown({
      ...readFormValues(formData, [
        'hasNumeratorDenominator',
        'numeratorDefinition',
        'numeratorDisclosureControl',
        'numeratorDisclosureControlDetail',
        'numeratorProviderId',
        'numeratorSourceId',
        'denominatorDefinition',
        'denominatorDisclosureControl',
        'denominatorDisclosureControlDetail',
        'denominatorProviderId',
        'denominatorSourceId',
      ]),
      numeratorSources: readSources(formData, 'numerator'),
      denominatorSources: readSources(formData, 'denominator'),
      dataValues,
    }),
    intent: readIntent(formData),
  };
}

/** The page offering the chosen provider's sources, as a browser without JavaScript asks. */
export function withSourcesShown(
  values: FormatAndSourcesPageValues,
  picker: SourcePicker,
  providers: readonly DataProvider[],
): FormatAndSourcesPageState {
  const { providerId } = choiceOf(values, picker);
  const shown = withPicker(values, picker, sourcesOf(values, picker), { providerId, sourceId: '' });
  const fieldErrors = sourcesNoLongerOffered(shown, providers);

  return providers.some(({ id }) => id === providerId)
    ? { values: shown, fieldErrors }
    : {
        values: shown,
        fieldErrors: { ...fieldErrors, [pickerFields(picker).providerId]: SELECT_DATA_PROVIDER },
      };
}

/** The add's errors, keyed by the picker's own selects. */
function pickerErrors(
  picker: SourcePicker,
  errors: Partial<Record<NewProviderSourceField, string>>,
): FieldErrors {
  const names = pickerFields(picker);
  return Object.fromEntries(
    Object.entries(errors).map(([field, message]) => [
      names[field as NewProviderSourceField],
      message,
    ]),
  );
}

/** The page with the chosen provider and source added to the picker's list, or refused. */
export function withSourceAdded(
  values: FormatAndSourcesPageValues,
  picker: SourcePicker,
  providers: readonly DataProvider[],
): FormatAndSourcesPageState {
  const added = addProviderSource(
    figureOf(picker),
    sourcesOf(values, picker),
    choiceOf(values, picker),
    providers,
  );

  if ('fieldErrors' in added) {
    return {
      values,
      fieldErrors: {
        ...sourcesNoLongerOffered(values, providers),
        ...pickerErrors(picker, added.fieldErrors),
      },
    };
  }

  const changed = withPicker(values, picker, added.sources, { providerId: '', sourceId: '' });
  return { values: changed, fieldErrors: sourcesNoLongerOffered(changed, providers) };
}

/** The page without the source at `index` of the picker's list, keeping anything chosen or typed. */
export function withSourceRemoved(
  values: FormatAndSourcesPageValues,
  picker: SourcePicker,
  index: number,
  providers: readonly DataProvider[],
): FormatAndSourcesPageState {
  const changed = withPicker(
    values,
    picker,
    sourcesOf(values, picker).filter((_, at) => at !== index),
    choiceOf(values, picker),
  );
  return { values: changed, fieldErrors: sourcesNoLongerOffered(changed, providers) };
}

/**
 * The page with a blank data value after the others, up to as many as a draft may hold. Adding
 * one answers "No", which a form without JavaScript may not have chosen.
 */
export function withDataValueAdded(
  values: FormatAndSourcesPageValues,
  providers: readonly DataProvider[],
): FormatAndSourcesPageState {
  const dataValues =
    values.dataValues.length < MAX_DATA_VALUES
      ? [...values.dataValues, BLANK_DATA_VALUE]
      : values.dataValues;
  const changed = { ...values, hasNumeratorDenominator: 'no', dataValues };

  return { values: changed, fieldErrors: sourcesNoLongerOffered(changed, providers) };
}

/** The page without the data value at `index`, keeping everything typed elsewhere. */
export function withDataValueRemoved(
  values: FormatAndSourcesPageValues,
  index: number,
  providers: readonly DataProvider[],
): FormatAndSourcesPageState {
  const changed = withDataValueShown({
    ...values,
    dataValues: values.dataValues.filter((_, at) => at !== index),
  });

  return { values: changed, fieldErrors: sourcesNoLongerOffered(changed, providers) };
}

/** The answers the page saves: the chosen branch's, and the other's cleared. */
function answersOf(values: FormatAndSourcesPageValues): FormatAndSourcesFormValues {
  const keepsNumerator = values.hasNumeratorDenominator === 'yes';
  const keepsDataValues = values.hasNumeratorDenominator === 'no';
  const part = (name: IndicatorCalculationPart) => {
    const fields = CALCULATION_PART_FIELDS[name];
    return {
      [fields.sources]: keepsNumerator ? values[fields.sources] : [],
      [fields.definition]: keepsNumerator ? values[fields.definition] : '',
      [fields.disclosureControl]: keepsNumerator ? values[fields.disclosureControl] : '',
      [fields.disclosureControlDetail]: keepsNumerator
        ? values[fields.disclosureControlDetail]
        : '',
    };
  };

  return {
    hasNumeratorDenominator: values.hasNumeratorDenominator,
    ...part('numerator'),
    ...part('denominator'),
    dataValues: keepsDataValues
      ? values.dataValues.map(
          ({ sources, definition, disclosureControl, disclosureControlDetail }) => ({
            sources,
            definition,
            disclosureControl,
            disclosureControlDetail,
          }),
        )
      : [],
  } as FormatAndSourcesFormValues;
}

/**
 * The answers to save, taking in each provider and source chosen but not yet added in the
 * branch kept, or the refusal. A refused add, or a source no longer offered, stands in for its
 * list's own refusal, beside the section's other refusals.
 */
export function withChosenSourcesTakenIn(
  section: FormatAndSourcesSection,
  values: FormatAndSourcesPageValues,
  providers: readonly DataProvider[],
):
  | SectionAnswers<FormatAndSourcesPageValues, FormatAndSourcesFormValues>
  | FormatAndSourcesPageState {
  const kept = keptPickers(values);
  let taken = values;
  const refusals: FieldErrors[] = [];

  for (const picker of kept) {
    const offered = sourcesNoLongerOffered(values, providers, [picker]);
    const choice = choiceOf(values, picker);
    const chosen = choice.providerId !== '' || choice.sourceId !== '';
    const added = chosen
      ? addProviderSource(figureOf(picker), sourcesOf(values, picker), choice, providers)
      : { sources: sourcesOf(values, picker) };

    if ('fieldErrors' in added)
      refusals.push({ ...offered, ...pickerErrors(picker, added.fieldErrors) });
    else if (Object.keys(offered).length > 0) refusals.push(offered);
    else taken = withPicker(taken, picker, added.sources, { providerId: '', sourceId: '' });
  }

  if (refusals.length === 0) return { values: taken, answers: answersOf(taken) };

  const submission = section.schema.safeParse(answersOf(values));
  const sectionErrors: FieldErrors = submission.success
    ? {}
    : toFieldErrors(submission.error, section.errorFields ?? section.fields);
  // A list whose add or source was refused is reported by that refusal alone.
  const refusedLists = new Set(
    kept
      .filter((picker) =>
        refusals.some((refusal) =>
          Object.values(pickerFields(picker)).some((name) => name in refusal),
        ),
      )
      .map((picker) => pickerFields(picker).sources),
  );
  const otherErrors = Object.fromEntries(
    Object.entries(sectionErrors).filter(
      ([field]) => !refusedLists.has(field as FormatAndSourcesPageFormField),
    ),
  );

  return { values, fieldErrors: Object.assign({}, otherErrors, ...refusals) };
}
