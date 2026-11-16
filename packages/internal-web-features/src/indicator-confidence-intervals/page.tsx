import {
  type CiMethod,
  type ConfidenceIntervalsField,
  confidenceIntervalsSection,
} from '@fphd/internal-api-features/contract';
import { firstRadioId, Radios, Select, Textarea } from '@fphd/ui';

import { IndicatorSectionForm, type SectionPageProps } from '../indicator-section-form.tsx';
import { useSelectedValue } from '../selected-value.ts';

interface ConfidenceIntervalsPageProps extends SectionPageProps<ConfidenceIntervalsField> {
  methods: readonly CiMethod[];
}

const listWithOr = new Intl.ListFormat('en-GB', { type: 'disjunction' });

/** Each follow-up is asked only of the methods that need it, once a method is chosen. */
export function ConfidenceIntervalsPage({ methods, ...form }: ConfidenceIntervalsPageProps) {
  const { fieldErrors, values } = form;
  const selected = useSelectedValue<ConfidenceIntervalsField>('ciMethodId', values.ciMethodId);
  const method = methods.find(({ id }) => id === selected.value);
  const namesOf = (test: (method: CiMethod) => boolean) =>
    listWithOr.format(methods.filter(test).map(({ name }) => name));
  const hidesFor = (kind: CiMethod['kind']) => selected.hides(method?.kind === kind);

  return (
    <IndicatorSectionForm
      guidance="other-or-modified-ci-method"
      fieldIds={{ hasCiMethodModifications: firstRadioId('hasCiMethodModifications') }}
      form={form}
      section={confidenceIntervalsSection}
      title="Confidence intervals"
    >
      <Select
        defaultValue={values.ciMethodId}
        error={fieldErrors.ciMethodId}
        label="Select the confidence interval method used"
        labelHeading="h2"
        name="ciMethodId"
        onChange={selected.onChange}
        options={[
          { label: 'Select', value: '' },
          ...methods.map(({ id, name }) => ({ label: name, value: id })),
        ]}
      />
      <div hidden={hidesFor('standard')}>
        {method?.kind === 'standard' && method.description !== null ? (
          <>
            <h2 className="govuk-heading-s">Standard description</h2>
            <p className="govuk-body fphd-metadata-text">{method.description}</p>
          </>
        ) : null}
        <Radios
          {...selected.hint(`Not needed for ${namesOf(({ kind }) => kind !== 'standard')}`)}
          defaultValue={values.hasCiMethodModifications}
          error={fieldErrors.hasCiMethodModifications}
          label="Were any modifications to the described method used for this indicator?"
          labelHeading="h2"
          name="hasCiMethodModifications"
          options={[
            {
              label: 'Yes',
              value: 'yes',
              conditional: (
                <Textarea
                  defaultValue={values.ciMethodModificationsDetail}
                  error={fieldErrors.ciMethodModificationsDetail}
                  label="Enter description of the modifications used"
                  name="ciMethodModificationsDetail"
                />
              ),
            },
            { label: 'No', value: 'no' },
          ]}
        />
      </div>
      <div hidden={hidesFor('other')}>
        <Textarea
          {...selected.hint(`Only needed for ${namesOf(({ kind }) => kind === 'other')}`)}
          defaultValue={values.ciMethodDetail}
          error={fieldErrors.ciMethodDetail}
          label="Provide detail of the other confidence interval method used"
          labelHeading="h2"
          name="ciMethodDetail"
        />
      </div>
    </IndicatorSectionForm>
  );
}
