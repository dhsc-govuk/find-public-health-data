import { type BenchmarkingField, benchmarkingSection } from '@fphd/internal-api-features/contract';
import { firstRadioId, Radios, Textarea, TextInput } from '@fphd/ui';
import { GOAL_POLARITIES, GOAL_POLARITY_LABELS } from '@fphd/utils/polarity';

import { IndicatorSectionForm, type SectionPageProps } from '../indicator-section-form.tsx';

export function BenchmarkingPage(form: SectionPageProps<BenchmarkingField>) {
  const { fieldErrors, values } = form;

  return (
    <IndicatorSectionForm
      guidance="policy-goal"
      form={form}
      fieldIds={{
        hasGoalBenchmark: firstRadioId('hasGoalBenchmark'),
        goalPolarity: firstRadioId('goalPolarity'),
      }}
      section={benchmarkingSection}
      title="Benchmarking"
    >
      <Radios
        defaultValue={values.hasGoalBenchmark}
        error={fieldErrors.hasGoalBenchmark}
        label="Are there any goal benchmarks for this indicator?"
        labelHeading="h2"
        name="hasGoalBenchmark"
        options={[
          {
            value: 'yes',
            label: 'Yes',
            // Shown without JavaScript; with it, only while Yes is chosen.
            conditional: (
              <>
                <TextInput
                  autoComplete="off"
                  className="govuk-input--width-5"
                  defaultValue={values.goalLowerValue}
                  error={fieldErrors.goalLowerValue}
                  hint="Value type must be the same as those used for data values in this indicator. You do not need to enter units."
                  label="Enter lower goal value"
                  labelHeading="h3"
                  name="goalLowerValue"
                  spellCheck={false}
                />
                <TextInput
                  autoComplete="off"
                  className="govuk-input--width-5"
                  defaultValue={values.goalUpperValue}
                  error={fieldErrors.goalUpperValue}
                  hint="Leave this blank if there is only a single goal value"
                  label="Enter upper goal value"
                  labelHeading="h3"
                  name="goalUpperValue"
                  spellCheck={false}
                />
                <Radios
                  classModifiers="small"
                  defaultValue={values.goalPolarity}
                  error={fieldErrors.goalPolarity}
                  label="Select polarity of goal"
                  labelHeading="h3"
                  name="goalPolarity"
                  options={GOAL_POLARITIES.map((value) => ({
                    value,
                    label: GOAL_POLARITY_LABELS[value],
                  }))}
                />
                <Textarea
                  defaultValue={values.goalPolicyDetail}
                  error={fieldErrors.goalPolicyDetail}
                  label="Provide detail about the policy goal"
                  labelHeading="h3"
                  name="goalPolicyDetail"
                  rows={5}
                />
              </>
            ),
          },
          { value: 'no', label: 'No' },
        ]}
      />
    </IndicatorSectionForm>
  );
}
