import {
  type CiMethod,
  type ConfidenceIntervalsField,
  confidenceIntervalsSection,
} from '@fphd/internal-api-features/contract';
import { firstRadioId, Radios, Select, Textarea } from '@fphd/ui';
import {
  CONFIDENCE_INTERVAL_DESCRIPTION,
  STANDARD_CONFIDENCE_INTERVAL_METHODS,
} from '@fphd/utils/standard-methods';

import { IndicatorSectionForm, type SectionPageProps } from '../indicator-section-form.tsx';
import { useSelectedValue } from '../selected-value.ts';
import { holdsMethodNoLongerOffered } from './offered.ts';

interface ConfidenceIntervalsPageProps extends SectionPageProps<ConfidenceIntervalsField> {
  methods: readonly CiMethod[];
}

const listWithOr = new Intl.ListFormat('en-GB', { type: 'disjunction' });

/** Shown in place of a saved method that the list no longer offers, which has no name to show. */
export const METHOD_NOT_OFFERED_LABEL = 'Method no longer available';

/** A method's own standard description, matched on its name, or null if it has none. */
function standardDescriptionOf({ name }: CiMethod): string | null {
  return (
    STANDARD_CONFIDENCE_INTERVAL_METHODS.find((method) => method.name === name)?.description ?? null
  );
}

/** The heading over a method's standard description. */
function DescriptionHeading() {
  return <h2 className="govuk-heading-s">Standard method description</h2>;
}

/** Each follow-up is asked only of the methods that need it, once a method is chosen. */
export function ConfidenceIntervalsPage({ methods, ...form }: ConfidenceIntervalsPageProps) {
  const { fieldErrors, values } = form;
  const selected = useSelectedValue<ConfidenceIntervalsField>('ciMethodId', values.ciMethodId);
  const method = methods.find(({ id }) => id === selected.value);
  const namesOf = (test: (method: CiMethod) => boolean) =>
    listWithOr.format(methods.filter(test).map(({ name }) => name));
  const hidesFor = (kind: CiMethod['kind']) => selected.hides(method?.kind === kind);
  const description = method === undefined ? null : standardDescriptionOf(method);
  const savedNoLongerOffered = holdsMethodNoLongerOffered(values.ciMethodId, methods);

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
          ...(savedNoLongerOffered
            ? [{ label: METHOD_NOT_OFFERED_LABEL, value: values.ciMethodId }]
            : []),
          ...methods.map(({ id, name }) => ({ label: name, value: id })),
        ]}
      />
      <div hidden={hidesFor('standard')}>
        {method?.kind === 'standard' ? (
          <>
            <DescriptionHeading />
            <p className="govuk-body">{CONFIDENCE_INTERVAL_DESCRIPTION}</p>
            {description === null ? null : <p className="govuk-body">{description}</p>}
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
      {method?.kind === 'none' && description !== null ? (
        <>
          <DescriptionHeading />
          <p className="govuk-body">{description}</p>
        </>
      ) : null}
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
