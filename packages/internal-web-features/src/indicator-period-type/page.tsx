import {
  type PeriodTypeField,
  type PeriodTypeFormValues,
  periodTypeSection,
} from '@fphd/internal-api-features/contract';
import {
  Checkboxes,
  DateInput,
  datePartId,
  firstCheckboxId,
  firstRadioId,
  Radios,
  TextInput,
} from '@fphd/ui';
import {
  ROLLING_FREQUENCIES,
  ROLLING_FREQUENCY_LABELS,
  TIME_PERIOD_LABELS,
  TIME_PERIODS,
  type TimePeriod,
  YEAR_TYPE_DATES,
  YEAR_TYPE_LABELS,
  YEAR_TYPES,
} from '@fphd/utils/period-type';
import type { ReactNode } from 'react';

import { IndicatorSectionForm, type SectionPageProps } from '../indicator-section-form.tsx';

type FieldErrors = Partial<Record<PeriodTypeField, string>>;

type DateField = Exclude<PeriodTypeField, 'timePeriods'>;

/** A date input's name, and the fields its day and month answer. */
interface DateControl {
  name: string;
  day: DateField;
  month: DateField;
}

const MULTIPLE_YEARS_END = {
  name: 'multipleYearsEnd',
  day: 'multipleYearsEndDay',
  month: 'multipleYearsEndMonth',
} as const satisfies DateControl;

const YEAR_END = {
  name: 'yearEnd',
  day: 'yearEndDay',
  month: 'yearEndMonth',
} as const satisfies DateControl;

const DATE_RANGE_START = {
  name: 'dateRangeStart',
  day: 'dateRangeStartDay',
  month: 'dateRangeStartMonth',
} as const satisfies DateControl;

const DATE_RANGE_END = {
  name: 'dateRangeEnd',
  day: 'dateRangeEndDay',
  month: 'dateRangeEndMonth',
} as const satisfies DateControl;

/** Where the error summary links each date's fields: the day and month inputs themselves. */
function dateFieldIds({ name, day, month }: DateControl) {
  return { [day]: datePartId(name, 'day'), [month]: datePartId(name, 'month') };
}

interface QuestionProps {
  values: PeriodTypeFormValues;
  fieldErrors: FieldErrors;
}

/** A day and month with no year, as each year ending on a specified date and each date range asks. */
function DayAndMonth({
  control,
  label,
  values,
  fieldErrors,
}: QuestionProps & { control: DateControl; label: ReactNode }) {
  return (
    <DateInput
      defaultValue={{ day: values[control.day], month: values[control.month] }}
      error={{ day: fieldErrors[control.day], month: fieldErrors[control.month] }}
      // Without one of its own the component offers an example; the design asks for none.
      hint={null}
      label={label}
      labelClassModifiers="s"
      name={control.name}
      year={false}
    />
  );
}

/** Which year a kind of period belongs to, its end date asked under "Ending a specified date". */
function YearTypeQuestion({
  field,
  end,
  values,
  fieldErrors,
}: QuestionProps & { field: 'multipleYearsYearType' | 'yearType'; end: DateControl }) {
  return (
    <Radios
      classModifiers="small"
      defaultValue={values[field]}
      error={fieldErrors[field]}
      label="Select year type"
      labelClassModifiers="s"
      name={field}
      options={YEAR_TYPES.map((value) =>
        value === 'specified-end-date'
          ? {
              label: YEAR_TYPE_LABELS[value],
              value,
              conditional: (
                <DayAndMonth
                  control={end}
                  fieldErrors={fieldErrors}
                  // The day and month labels name the inputs, so the legend is for screen readers.
                  label={<span className="govuk-visually-hidden">Enter date</span>}
                  values={values}
                />
              ),
            }
          : { label: `${YEAR_TYPE_LABELS[value]} (${YEAR_TYPE_DATES[value]})`, value },
      )}
    />
  );
}

/** The questions each kind of time period reveals when it is ticked; quarters and months ask none. */
function revealed(period: TimePeriod, props: QuestionProps): ReactNode {
  const { values, fieldErrors } = props;

  switch (period) {
    case 'multiple-years':
      return (
        <>
          <TextInput
            autoComplete="off"
            className="govuk-input--width-2"
            defaultValue={values.multipleYearsCount}
            error={fieldErrors.multipleYearsCount}
            inputMode="numeric"
            label="Enter number of years"
            name="multipleYearsCount"
            spellCheck={false}
          />
          <YearTypeQuestion {...props} end={MULTIPLE_YEARS_END} field="multipleYearsYearType" />
        </>
      );
    case 'single-years':
      return <YearTypeQuestion {...props} end={YEAR_END} field="yearType" />;
    case 'date-range':
      return (
        <>
          <DayAndMonth {...props} control={DATE_RANGE_START} label="Start date" />
          <DayAndMonth {...props} control={DATE_RANGE_END} label="End date" />
        </>
      );
    default:
      return undefined;
  }
}

export function PeriodTypePage(form: SectionPageProps<PeriodTypeField, PeriodTypeFormValues>) {
  const { fieldErrors, values } = form;
  const props = { fieldErrors, values };

  return (
    <IndicatorSectionForm
      fieldIds={{
        timePeriods: firstCheckboxId('timePeriods'),
        multipleYearsYearType: firstRadioId('multipleYearsYearType'),
        ...dateFieldIds(MULTIPLE_YEARS_END),
        yearType: firstRadioId('yearType'),
        ...dateFieldIds(YEAR_END),
        ...dateFieldIds(DATE_RANGE_START),
        ...dateFieldIds(DATE_RANGE_END),
        periodsRolling: firstRadioId('periodsRolling'),
        rollingFrequency: firstRadioId('rollingFrequency'),
        valuesCumulative: firstRadioId('valuesCumulative'),
      }}
      form={form}
      section={periodTypeSection}
      title="Time periods"
    >
      <Checkboxes
        defaultValue={values.timePeriods}
        error={fieldErrors.timePeriods}
        label="Select all time periods used in this indicator"
        labelHeading="h2"
        name="timePeriods"
        // Each kind's questions show without JavaScript. With it, they show only while it is ticked.
        options={TIME_PERIODS.map((period) => {
          const conditional = revealed(period, props);
          return {
            value: period,
            label: TIME_PERIOD_LABELS[period],
            ...(conditional === undefined ? {} : { conditional }),
          };
        })}
      />
      <Radios
        defaultValue={values.periodsRolling}
        error={fieldErrors.periodsRolling}
        label="Are time periods rolling?"
        labelHeading="h2"
        name="periodsRolling"
        options={[
          {
            label: 'Yes',
            value: 'yes',
            conditional: (
              <Radios
                classModifiers="small"
                defaultValue={values.rollingFrequency}
                error={fieldErrors.rollingFrequency}
                label="Select rolling frequency"
                labelClassModifiers="s"
                name="rollingFrequency"
                options={ROLLING_FREQUENCIES.map((value) => ({
                  label: ROLLING_FREQUENCY_LABELS[value],
                  value,
                }))}
              />
            ),
          },
          { label: 'No', value: 'no' },
        ]}
      />
      <Radios
        defaultValue={values.valuesCumulative}
        error={fieldErrors.valuesCumulative}
        label="Are values cumulative across time periods?"
        labelHeading="h2"
        name="valuesCumulative"
        options={[
          { label: 'Yes', value: 'yes' },
          { label: 'No', value: 'no' },
        ]}
      />
      <TextInput
        defaultValue={values.publishedFrom}
        error={fieldErrors.publishedFrom}
        hint="Enter a date in the format YYYY-MM-DD, for example 2021-04-01. Only periods starting on or after this date will be shown. Leave blank to show all periods."
        label="Show data from (optional)"
        labelHeading="h2"
        name="publishedFrom"
      />
    </IndicatorSectionForm>
  );
}
