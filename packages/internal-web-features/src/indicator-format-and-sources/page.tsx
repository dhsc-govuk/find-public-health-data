import {
  CALCULATION_PART_FIELDS,
  DATA_VALUE_PARTS,
  type DataProvider,
  dataValueFieldName,
  type IndicatorCalculationPart,
  MAX_DATA_VALUES,
  type NewProviderSourceFormValues,
  NO_SPECIFIC_SOURCE,
  type ProviderSource,
  providerSourceLabel,
} from '@fphd/internal-api-features/contract';
import { Button, fieldInputId, firstRadioId, Radios, SelectAutocomplete, Textarea } from '@fphd/ui';
import { INDICATOR_DISCLOSURE_CONTROL_LABELS } from '@fphd/utils/disclosure-control';
import { useRef } from 'react';

import { IndicatorSectionForm, type SectionPageProps } from '../indicator-section-form.tsx';
import { useSelectedValue } from '../selected-value.ts';
import {
  ADD_DATA_VALUE_INTENT,
  addSourceIntent,
  type DataValuePageValues,
  type FormatAndSourcesPageFormField,
  type FormatAndSourcesPageValues,
  pickerFields,
  removeDataValueIntent,
  removeSourceIntent,
  type SourcePicker,
  showSourcesIntent,
  sourceFieldName,
} from './form.ts';

type FieldErrors = Partial<Record<FormatAndSourcesPageFormField, string>>;

const TITLE = 'Indicator format and sources';

/** A picker's list, then its two selects, as the page asks them. */
function pickerOrder(picker: SourcePicker): FormatAndSourcesPageFormField[] {
  const { sources, providerId, sourceId } = pickerFields(picker);
  return [sources, providerId, sourceId];
}

/** Every field in the order the page asks them, which the error summary follows. */
function pageFields(dataValueCount: number): FormatAndSourcesPageFormField[] {
  const part = (name: IndicatorCalculationPart): FormatAndSourcesPageFormField[] => {
    const fields = CALCULATION_PART_FIELDS[name];
    return [
      ...pickerOrder(name),
      fields.definition,
      fields.disclosureControl,
      fields.disclosureControlDetail,
    ];
  };

  return [
    'hasNumeratorDenominator',
    ...part('numerator'),
    ...part('denominator'),
    'dataValues',
    ...Array.from({ length: dataValueCount }, (_, index) => [
      ...pickerOrder(index),
      ...DATA_VALUE_PARTS.filter((name) => name !== 'sources').map((name) =>
        dataValueFieldName(index, name),
      ),
    ]).flat(),
  ];
}

/** Where each error summary link goes when it is not the field's own input. */
function fieldIdsOf(
  dataValueCount: number,
): Partial<Record<FormatAndSourcesPageFormField, string>> {
  const pickers: SourcePicker[] = [
    'numerator',
    'denominator',
    ...Array.from({ length: dataValueCount }, (_, index) => index),
  ];

  return {
    hasNumeratorDenominator: firstRadioId('hasNumeratorDenominator'),
    numeratorDisclosureControl: firstRadioId('numeratorDisclosureControl'),
    denominatorDisclosureControl: firstRadioId('denominatorDisclosureControl'),
    dataValues: fieldInputId(dataValueFieldName(0, 'providerId')),
    ...Object.fromEntries(
      pickers.map((picker) => {
        const { sources, providerId } = pickerFields(picker);
        return [sources, fieldInputId(providerId)];
      }),
    ),
    ...Object.fromEntries(
      Array.from({ length: dataValueCount }, (_, index) => {
        const name = dataValueFieldName(index, 'disclosureControl');
        return [name, firstRadioId(name)];
      }),
    ),
  };
}

/** The sources added to one list, each carried in hidden fields until Continue saves it. */
function AddedSources({
  picker,
  providers,
  sources,
}: {
  picker: SourcePicker;
  providers: readonly DataProvider[];
  sources: readonly ProviderSource[];
}) {
  if (sources.length === 0) return null;

  return (
    <ul className="fphd-added-list govuk-!-margin-bottom-6">
      {sources.map((source, index) => {
        const label = providerSourceLabel(source, providers);

        return (
          // Two sources no longer offered read the same, so the key is the position.
          <li className="fphd-added-list__item" key={index}>
            <input
              name={sourceFieldName(picker, index, 'providerId')}
              type="hidden"
              value={source.providerId}
            />
            <input
              name={sourceFieldName(picker, index, 'sourceId')}
              type="hidden"
              value={source.sourceId ?? ''}
            />
            <span>{label}</span>
            <Button
              classModifiers="secondary"
              className="govuk-!-margin-bottom-0"
              name="intent"
              value={removeSourceIntent(picker, index)}
            >
              {'Remove '}
              <span className="govuk-visually-hidden">{label}</span>
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * One list's sources, and the selects that add another. A provider's sources are offered once
 * it is chosen: in the browser as soon as it is, and without JavaScript by Show sources, which
 * sends the form back with the provider chosen. In the browser, picking a source from the
 * suggestions adds it at once, by sending the form as Add source would. Add source itself is
 * shown only without JavaScript.
 */
function SourcePickerQuestion({
  picker,
  label,
  providers,
  sources,
  choice,
  fieldErrors,
}: {
  picker: SourcePicker;
  label: string;
  providers: readonly DataProvider[];
  sources: readonly ProviderSource[];
  choice: NewProviderSourceFormValues;
  fieldErrors: FieldErrors;
}) {
  const names = pickerFields(picker);
  const selected = useSelectedValue(names.providerId, choice.providerId);
  const provider = providers.find(({ id }) => id === selected.value);
  // A refusal of the list itself is shown on the provider select, where a source is chosen.
  const providerError = fieldErrors[names.providerId] ?? fieldErrors[names.sources];
  const addSource = useRef<HTMLDivElement>(null);
  const pressAddSource = () => {
    const button = addSource.current?.querySelector('button');
    button?.form?.requestSubmit(button);
  };

  return (
    <>
      <AddedSources picker={picker} providers={providers} sources={sources} />
      <SelectAutocomplete
        defaultValue={choice.providerId}
        error={providerError}
        label={label}
        labelHeading="h2"
        name={names.providerId}
        onChange={selected.onChange}
        options={[
          { label: 'Select a data provider', value: '' },
          ...providers.map(({ id, name }) => ({ label: name, value: id })),
        ]}
      />
      <p className="govuk-hint">
        If you cannot find a provider in the list, you can request a data provider be added.
      </p>
      {selected.enhanced ? null : (
        <Button classModifiers="secondary" name="intent" value={showSourcesIntent(picker)}>
          Show sources
        </Button>
      )}
      <div hidden={provider === undefined}>
        <SelectAutocomplete
          defaultValue={selected.value === choice.providerId ? choice.sourceId : ''}
          error={fieldErrors[names.sourceId]}
          // Only a browser with JavaScript adds on a pick, so only it is told so.
          hint={selected.enhanced ? 'Selecting a source adds it to the list' : undefined}
          // Remounted for each provider, so the choice starts again with its sources.
          key={selected.value}
          label={
            provider === undefined
              ? 'Add the specific source'
              : `Add the specific source from ${provider.name}`
          }
          labelHeading="h3"
          name={names.sourceId}
          onPick={pressAddSource}
          options={[
            { label: 'Select a source', value: '' },
            { label: 'No specific source', value: NO_SPECIFIC_SOURCE },
            ...(provider?.sources ?? []).map(({ id, name }) => ({ label: name, value: id })),
          ]}
        />
        <p className="govuk-hint">
          If you cannot find a source in the list, you can request a data source be added.
        </p>
        <div hidden={selected.enhanced} ref={addSource}>
          <Button classModifiers="secondary" name="intent" value={addSourceIntent(picker)}>
            Add source
          </Button>
        </div>
      </div>
    </>
  );
}

/** Whether disclosure control was applied to a figure, with its details beside Yes. */
function DisclosureControlQuestion({
  name,
  detailName,
  legend,
  value,
  detail,
  fieldErrors,
}: {
  name: FormatAndSourcesPageFormField;
  detailName: FormatAndSourcesPageFormField;
  legend: string;
  value: string;
  detail: string;
  fieldErrors: FieldErrors;
}) {
  return (
    <Radios
      defaultValue={value}
      error={fieldErrors[name]}
      label={legend}
      labelClassModifiers="s"
      name={name}
      options={[
        {
          value: 'yes',
          label: INDICATOR_DISCLOSURE_CONTROL_LABELS.yes,
          // Shown without JavaScript; with it, only while Yes is chosen.
          conditional: (
            <Textarea
              defaultValue={detail}
              error={fieldErrors[detailName]}
              label="Provide details"
              name={detailName}
              rows={2}
            />
          ),
        },
        { value: 'not-applicable', label: INDICATOR_DISCLOSURE_CONTROL_LABELS['not-applicable'] },
      ]}
    />
  );
}

/** The numerator's or denominator's sources, definition and disclosure control. */
function CalculationPartQuestions({
  part,
  values,
  providers,
  fieldErrors,
}: {
  part: IndicatorCalculationPart;
  values: FormatAndSourcesPageValues;
  providers: readonly DataProvider[];
  fieldErrors: FieldErrors;
}) {
  const fields = CALCULATION_PART_FIELDS[part];

  return (
    <>
      <SourcePickerQuestion
        choice={{
          providerId: values[`${part}ProviderId`],
          sourceId: values[`${part}SourceId`],
        }}
        fieldErrors={fieldErrors}
        label={`Add a data provider for the ${part}`}
        picker={part}
        providers={providers}
        sources={values[fields.sources]}
      />
      <Textarea
        defaultValue={values[fields.definition]}
        error={fieldErrors[fields.definition]}
        label={`Enter the definition of the ${part}`}
        labelHeading="h2"
        name={fields.definition}
        rows={5}
      />
      <DisclosureControlQuestion
        detail={values[fields.disclosureControlDetail]}
        detailName={fields.disclosureControlDetail}
        fieldErrors={fieldErrors}
        legend={`Has disclosure control been applied to the ${part}?`}
        name={fields.disclosureControl}
        value={values[fields.disclosureControl]}
      />
    </>
  );
}

/** The data values as typed, each removable while there is another, and the button to add one. */
function DataValues({
  dataValues,
  providers,
  fieldErrors,
}: {
  dataValues: readonly DataValuePageValues[];
  providers: readonly DataProvider[];
  fieldErrors: FieldErrors;
}) {
  return (
    <>
      {dataValues.map((dataValue, index) => {
        const number = index + 1;
        // A refusal of the list as a whole is shown on the first data value's sources.
        const errors: FieldErrors =
          index === 0 && fieldErrors.dataValues !== undefined
            ? {
                ...fieldErrors,
                [dataValueFieldName(0, 'sources')]:
                  fieldErrors[dataValueFieldName(0, 'sources')] ?? fieldErrors.dataValues,
              }
            : fieldErrors;

        return (
          // The data values have no identity but their position.
          <div key={index}>
            <SourcePickerQuestion
              choice={{ providerId: dataValue.providerId, sourceId: dataValue.sourceId }}
              fieldErrors={errors}
              label={`Add a data provider (Data value ${number})`}
              picker={index}
              providers={providers}
              sources={dataValue.sources}
            />
            <Textarea
              defaultValue={dataValue.definition}
              error={errors[dataValueFieldName(index, 'definition')]}
              label={`Enter the definition for this data (Data value ${number})`}
              labelHeading="h2"
              name={dataValueFieldName(index, 'definition')}
              rows={5}
            />
            <DisclosureControlQuestion
              detail={dataValue.disclosureControlDetail}
              detailName={dataValueFieldName(index, 'disclosureControlDetail')}
              fieldErrors={errors}
              legend="Has disclosure control been applied to this data value?"
              name={dataValueFieldName(index, 'disclosureControl')}
              value={dataValue.disclosureControl}
            />
            {dataValues.length > 1 ? (
              <Button classModifiers="secondary" name="intent" value={removeDataValueIntent(index)}>
                Remove data value {number}
              </Button>
            ) : null}
          </div>
        );
      })}
      {dataValues.length < MAX_DATA_VALUES ? (
        <Button
          classModifiers="secondary"
          className="govuk-!-margin-bottom-0"
          name="intent"
          value={ADD_DATA_VALUE_INTENT}
        >
          Add another data value
        </Button>
      ) : null}
    </>
  );
}

interface FormatAndSourcesPageProps
  extends SectionPageProps<FormatAndSourcesPageFormField, FormatAndSourcesPageValues> {
  providers: readonly DataProvider[];
}

/**
 * Whether the indicator has a numerator and denominator, then the sources, definition and
 * disclosure control of each, or of each data value it has instead.
 */
export function FormatAndSourcesPage({ providers, ...form }: FormatAndSourcesPageProps) {
  const { fieldErrors, values } = form;

  return (
    <IndicatorSectionForm
      continueOnEnter
      fieldIds={fieldIdsOf(values.dataValues.length)}
      fields={pageFields(values.dataValues.length)}
      form={form}
      guidance="numerator"
      title={TITLE}
    >
      <Radios
        defaultValue={values.hasNumeratorDenominator}
        error={fieldErrors.hasNumeratorDenominator}
        label="Does this indicator have a numerator and denominator?"
        labelHeading="h2"
        name="hasNumeratorDenominator"
        options={[
          {
            value: 'yes',
            label: 'Yes',
            // Shown without JavaScript; with it, only while this answer is chosen.
            conditional: (
              <>
                <CalculationPartQuestions
                  fieldErrors={fieldErrors}
                  part="numerator"
                  providers={providers}
                  values={values}
                />
                <CalculationPartQuestions
                  fieldErrors={fieldErrors}
                  part="denominator"
                  providers={providers}
                  values={values}
                />
              </>
            ),
          },
          {
            value: 'no',
            label: 'No',
            conditional: (
              <DataValues
                dataValues={values.dataValues}
                fieldErrors={fieldErrors}
                providers={providers}
              />
            ),
          },
        ]}
      />
    </IndicatorSectionForm>
  );
}
