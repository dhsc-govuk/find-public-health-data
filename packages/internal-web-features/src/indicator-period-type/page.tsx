import { type PeriodTypeField, periodTypeSection } from '@fphd/internal-api-features/contract';
import { DateInput, datePartId, datePartName, firstRadioId, Radios, TextInput } from '@fphd/ui';
import {
  PERIOD_TYPE_LABELS,
  PERIOD_TYPES_WITH_YEAR_TYPE,
  YEAR_TYPE_LABELS,
} from '@fphd/utils/period-type';

import type { ControlNames } from '../form-values.ts';
import { IndicatorSectionForm, type SectionPageProps } from '../indicator-section-form.tsx';

/** The period types that ask for a year type, each asking it in its own reveal. */
type YearTypeSet = (typeof PERIOD_TYPES_WITH_YEAR_TYPE)[number];

type YearTypeField = Exclude<PeriodTypeField, 'periodType' | 'publishedFrom'>;

/** Without JavaScript every reveal shows, so each set of year type controls has its own names. */
function yearTypeControls(set: YearTypeSet, control: (group: string, part: string) => string) {
  return {
    yearType: `${set}YearType`,
    yearEndDay: control(`${set}YearEnd`, 'day'),
    yearEndMonth: control(`${set}YearEnd`, 'month'),
  } satisfies Record<YearTypeField, string>;
}

function yearTypeSetOf(periodType: string): YearTypeSet | undefined {
  return PERIOD_TYPES_WITH_YEAR_TYPE.find((set) => set === periodType);
}

/** The year type answers are read from the set under the chosen period type, and no other. */
export function periodTypeControlNames(formData: FormData): ControlNames<PeriodTypeField> {
  const periodType = formData.get('periodType');
  const set = typeof periodType === 'string' ? yearTypeSetOf(periodType) : undefined;

  return set === undefined ? {} : yearTypeControls(set, datePartName);
}

const NO_YEAR_TYPE: Record<YearTypeField, string> = {
  yearType: '',
  yearEndDay: '',
  yearEndMonth: '',
};

interface YearTypeQuestionProps {
  set: YearTypeSet;
  /** The answers and messages of the set under the chosen period type; empty for the other. */
  values: Record<YearTypeField, string>;
  fieldErrors: Partial<Record<PeriodTypeField, string>>;
}

function YearTypeQuestion({ fieldErrors, set, values }: YearTypeQuestionProps) {
  const { yearEndDay, yearEndMonth, yearType: yearTypeError } = fieldErrors;
  const yearEndError = { day: yearEndDay, month: yearEndMonth };

  return (
    <Radios
      classModifiers="small"
      defaultValue={values.yearType}
      error={yearTypeError}
      label="Select year type"
      labelClassModifiers="s"
      name={`${set}YearType`}
      options={[
        ...(['calendar', 'financial', 'academic', 'rolling'] as const).map((value) => ({
          label: YEAR_TYPE_LABELS[value],
          value,
        })),
        {
          label: YEAR_TYPE_LABELS['specified-end-date'],
          value: 'specified-end-date',
          conditional: (
            <DateInput
              defaultValue={{ day: values.yearEndDay, month: values.yearEndMonth }}
              error={yearEndError}
              // Without one of its own the component offers an example; the design asks for none.
              hint={null}
              label={<span className="govuk-visually-hidden">Enter date</span>}
              name={`${set}YearEnd`}
              year={false}
            />
          ),
        },
      ]}
    />
  );
}

// The same year type question sits under both Years and Quarters; only the chosen one is read.
export function PeriodTypePage(form: SectionPageProps<PeriodTypeField>) {
  const { fieldErrors, values } = form;
  const chosenSet = yearTypeSetOf(values.periodType);

  const question = (set: YearTypeSet) => (
    <YearTypeQuestion
      fieldErrors={set === chosenSet ? fieldErrors : {}}
      set={set}
      values={set === chosenSet ? values : NO_YEAR_TYPE}
    />
  );

  return (
    <IndicatorSectionForm
      form={form}
      fieldIds={{
        periodType: firstRadioId('periodType'),
        ...(chosenSet === undefined
          ? {}
          : {
              ...yearTypeControls(chosenSet, datePartId),
              yearType: firstRadioId(`${chosenSet}YearType`),
            }),
      }}
      section={periodTypeSection}
      title="What is the period type in this indicator?"
    >
      <Radios
        defaultValue={values.periodType}
        error={fieldErrors.periodType}
        label="Select period type"
        labelHeading="h2"
        name="periodType"
        options={[
          {
            label: PERIOD_TYPE_LABELS.years,
            value: 'years',
            conditional: question('years'),
          },
          {
            label: PERIOD_TYPE_LABELS.quarters,
            value: 'quarters',
            conditional: question('quarters'),
          },
          { label: PERIOD_TYPE_LABELS.months, value: 'months' },
        ]}
      />
      <TextInput
        defaultValue={values.publishedFrom}
        error={fieldErrors.publishedFrom}
        hint="Enter a date in the format YYYY-MM-DD, for example 2021-04-01. Only periods starting on or after this date will be shown. Leave blank to show all periods."
        label="Show data from (optional)"
        name="publishedFrom"
      />
    </IndicatorSectionForm>
  );
}
