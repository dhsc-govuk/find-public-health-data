import {
  DEMOGRAPHIC_LIST_FIELDS,
  type SexAndAgesField,
  type SexAndAgesFormValues,
  sexAndAgesSection,
} from '@fphd/internal-api-features/contract';
import { Checkboxes, firstCheckboxId } from '@fphd/ui';
import {
  DEMOGRAPHIC_LABELS,
  DEMOGRAPHICS,
  type Demographic,
  ETHNIC_GROUP_LABELS,
  ETHNIC_GROUPS,
  GENDER_LABELS,
  GENDERS,
  SEX_LABELS,
  SEXES,
} from '@fphd/utils/sex-gender-and-ethnicity';

import { IndicatorSectionForm, type SectionPageProps } from '../indicator-section-form.tsx';

type FieldErrors = Partial<Record<SexAndAgesField, string>>;

const TITLE = 'Sex, gender and ethnicity';

function optionsOf<Value extends string>(values: readonly Value[], labels: Record<Value, string>) {
  return values.map((value) => ({ value, label: labels[value] }));
}

/** The question each demographic reveals when it is ticked, asking which ones are included. */
const INCLUDED: Readonly<
  Record<Demographic, { label: string; options: { value: string; label: string }[] }>
> = {
  sex: { label: 'Select included sexes', options: optionsOf(SEXES, SEX_LABELS) },
  gender: { label: 'Select included genders', options: optionsOf(GENDERS, GENDER_LABELS) },
  ethnicity: {
    label: 'Select included ethnic groups',
    options: optionsOf(ETHNIC_GROUPS, ETHNIC_GROUP_LABELS),
  },
};

/** What was collected, each demographic revealing the question of which ones are included. */
function Demographics({
  values,
  fieldErrors,
}: {
  values: SexAndAgesFormValues;
  fieldErrors: FieldErrors;
}) {
  const included = (demographic: Demographic) => {
    const field = DEMOGRAPHIC_LIST_FIELDS[demographic];

    return (
      <Checkboxes
        defaultValue={values[field]}
        error={fieldErrors[field]}
        label={INCLUDED[demographic].label}
        name={field}
        options={INCLUDED[demographic].options}
      />
    );
  };

  return (
    <Checkboxes
      defaultValue={values.demographics}
      error={fieldErrors.demographics}
      hint="Select all that apply"
      label="What was collected for this indicator?"
      labelHeading="h2"
      name="demographics"
      // Each list is shown without JavaScript. With it, a list shows only while its demographic
      // is ticked.
      options={DEMOGRAPHICS.map((demographic) => ({
        value: demographic,
        label: DEMOGRAPHIC_LABELS[demographic],
        conditional: included(demographic),
      }))}
    />
  );
}

export function SexAndAgesPage(form: SectionPageProps<SexAndAgesField, SexAndAgesFormValues>) {
  const { fieldErrors, values } = form;

  return (
    <IndicatorSectionForm
      fieldIds={{
        demographics: firstCheckboxId('demographics'),
        sexes: firstCheckboxId('sexes'),
        genders: firstCheckboxId('genders'),
        ethnicGroups: firstCheckboxId('ethnicGroups'),
      }}
      form={form}
      section={sexAndAgesSection}
      title={TITLE}
    >
      <Demographics fieldErrors={fieldErrors} values={values} />
    </IndicatorSectionForm>
  );
}
