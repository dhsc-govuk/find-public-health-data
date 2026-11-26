import {
  type BenchmarkingFormValues,
  type BenchmarkingPageField,
  MAX_POLICY_GOALS,
  POLICY_GOAL_PARTS,
  type PolicyGoalFormValues,
  type PolicyGoalPart,
  policyGoalFieldName,
  policyGoalOf,
} from '@fphd/internal-api-features/contract';
import {
  Button,
  FormGroup,
  fieldInputId,
  firstRadioId,
  Radios,
  Select,
  Textarea,
  TextInput,
} from '@fphd/ui';
import { GOAL_POLARITIES, GOAL_POLARITY_LABELS } from '@fphd/utils/polarity';
import {
  GOAL_COMPARISON_LABELS,
  GOAL_LOWER_COMPARISONS,
  GOAL_UPPER_COMPARISONS,
  type GoalLowerComparison,
  type GoalUpperComparison,
} from '@fphd/utils/policy-goal';
import type { ReactNode } from 'react';

import { IndicatorSectionForm, type SectionPageProps } from '../indicator-section-form.tsx';
import { ADD_INTENT, focusesItem, type ListFocus, removeIntent } from '../list-form.ts';

type FieldErrors = Partial<Record<BenchmarkingPageField, string>>;

export const BENCHMARKING_TITLE = 'Are there any policy goal benchmarks for this indicator?';

/** Every field in the order the page asks them, which the error summary follows. */
function pageFields(goalCount: number): BenchmarkingPageField[] {
  return [
    'hasGoalBenchmark',
    'goals',
    ...Array.from({ length: goalCount }, (_, index) =>
      POLICY_GOAL_PARTS.map((part) => policyGoalFieldName(index, part)),
    ).flat(),
  ];
}

/** Where each summary link goes that is not the field's own input: the first radio of a choice. */
function pageFieldIds(goalCount: number): Partial<Record<BenchmarkingPageField, string>> {
  return Object.fromEntries([
    ['hasGoalBenchmark', firstRadioId('hasGoalBenchmark')],
    ['goals', fieldInputId(policyGoalFieldName(0, 'lowerValue'))],
    ...Array.from({ length: goalCount }, (_, index) => {
      const polarity = policyGoalFieldName(index, 'polarity');
      return [polarity, firstRadioId(polarity)];
    }),
  ]);
}

/**
 * Text a screen reader hears after a label, saying which goal it is in, from the second on. The
 * space sits outside the hidden text, so the words stay apart in a legend's accessible name.
 */
function goalOf(index: number): ReactNode {
  const of = policyGoalOf(index).trim();
  return of === '' ? null : (
    <>
      {' '}
      <span className="govuk-visually-hidden">{of}</span>
    </>
  );
}

function comparisonOptions(comparisons: readonly (GoalLowerComparison | GoalUpperComparison)[]) {
  return [
    { value: '', label: 'Select' },
    ...comparisons.map((value) => ({ value, label: GOAL_COMPARISON_LABELS[value] })),
  ];
}

/**
 * One goal value and its comparison, side by side under one legend. Each control shows its own
 * refusal above it, and is marked invalid and described by that message, as on the ages page.
 * The value has no decimal keypad, which on iOS has no minus key, as a goal can be negative.
 */
function GoalValue({
  autoFocus = false,
  bound,
  fieldErrors,
  goal,
  hint,
  index,
}: {
  autoFocus?: boolean;
  bound: 'lower' | 'upper';
  fieldErrors: FieldErrors;
  goal: PolicyGoalFormValues;
  hint: string;
  index: number;
}) {
  const [comparisonPart, valuePart]: [PolicyGoalPart, PolicyGoalPart] =
    bound === 'lower' ? ['lowerComparison', 'lowerValue'] : ['upperComparison', 'upperValue'];
  const comparisonName = policyGoalFieldName(index, comparisonPart);
  const valueName = policyGoalFieldName(index, valuePart);
  const comparisonError = fieldErrors[comparisonName];
  const valueError = fieldErrors[valueName];

  return (
    <FormGroup
      hint={hint}
      id={`${valueName}-group`}
      label={
        <>
          Enter {bound} goal value{goalOf(index)}
        </>
      }
      labelHeading="h3"
    >
      <div className="fphd-field-row">
        <Select
          aria-invalid={comparisonError === undefined ? undefined : true}
          autoFocus={autoFocus}
          defaultValue={goal[comparisonPart]}
          error={comparisonError}
          label={
            <span className="govuk-visually-hidden">
              Comparison for the {bound} goal value{policyGoalOf(index)}
            </span>
          }
          name={comparisonName}
          options={comparisonOptions(
            bound === 'lower' ? GOAL_LOWER_COMPARISONS : GOAL_UPPER_COMPARISONS,
          )}
        />
        <TextInput
          autoComplete="off"
          className="govuk-input--width-5"
          aria-invalid={valueError === undefined ? undefined : true}
          defaultValue={goal[valuePart]}
          error={valueError}
          label={
            <span className="govuk-visually-hidden">
              {bound === 'lower' ? 'Lower' : 'Upper'} goal value{policyGoalOf(index)}
            </span>
          }
          name={valueName}
          spellCheck={false}
        />
      </div>
    </FormGroup>
  );
}

/**
 * The goals as typed, each under its heading and removable while there is another. After an Add
 * or a Remove, the lower value's comparison of the goal `focus` names takes focus.
 */
function PolicyGoals({
  goals,
  fieldErrors,
  focus,
}: {
  goals: readonly PolicyGoalFormValues[];
  fieldErrors: FieldErrors;
  focus: ListFocus<string> | undefined;
}) {
  return (
    <>
      {goals.map((goal, index) => {
        const polarity = policyGoalFieldName(index, 'polarity');
        const detail = policyGoalFieldName(index, 'detail');

        return (
          <div key={index}>
            <h2 className="govuk-heading-m">Policy goal {index + 1}</h2>
            <GoalValue
              autoFocus={focusesItem(focus, index)}
              bound="lower"
              fieldErrors={fieldErrors}
              goal={goal}
              hint="Values must be consistent with those used for data values in this indicator. You do not need to enter units."
              index={index}
            />
            <GoalValue
              bound="upper"
              fieldErrors={fieldErrors}
              goal={goal}
              hint="Leave this blank if there is only a single goal value"
              index={index}
            />
            <Radios
              classModifiers="small"
              defaultValue={goal.polarity}
              error={fieldErrors[polarity]}
              label={<>Select polarity of goal{goalOf(index)}</>}
              labelHeading="h3"
              name={polarity}
              options={GOAL_POLARITIES.map((value) => ({
                value,
                label: GOAL_POLARITY_LABELS[value],
              }))}
            />
            <Textarea
              defaultValue={goal.detail}
              error={fieldErrors[detail]}
              label={<>Provide detail about the policy goal{goalOf(index)}</>}
              labelHeading="h3"
              name={detail}
              rows={5}
            />
            {goals.length > 1 ? (
              <Button classModifiers="secondary" name="intent" value={removeIntent(index)}>
                Remove policy goal {index + 1}
              </Button>
            ) : null}
          </div>
        );
      })}
      {goals.length < MAX_POLICY_GOALS ? (
        <Button
          classModifiers="secondary"
          className="govuk-!-margin-bottom-0"
          name="intent"
          value={ADD_INTENT}
        >
          Add another policy goal
        </Button>
      ) : null}
    </>
  );
}

// The question is the page's h1, with the guidance link under it. The radios' legend repeats the
// question for screen readers only.
export function BenchmarkingPage(
  form: SectionPageProps<BenchmarkingPageField, BenchmarkingFormValues>,
) {
  const { fieldErrors, focus, values } = form;

  return (
    <IndicatorSectionForm
      continueOnEnter
      fieldIds={pageFieldIds(values.goals.length)}
      fields={pageFields(values.goals.length)}
      form={form}
      guidance="policy-goal"
      title={BENCHMARKING_TITLE}
    >
      <Radios
        defaultValue={values.hasGoalBenchmark}
        error={fieldErrors.hasGoalBenchmark}
        label={<span className="govuk-visually-hidden">{BENCHMARKING_TITLE}</span>}
        name="hasGoalBenchmark"
        options={[
          {
            value: 'yes',
            label: 'Yes',
            // Shown without JavaScript; with it, only while Yes is chosen.
            conditional: (
              <PolicyGoals
                fieldErrors={{
                  ...fieldErrors,
                  // A refusal of the list as a whole is shown where the first goal starts.
                  [policyGoalFieldName(0, 'lowerValue')]:
                    fieldErrors[policyGoalFieldName(0, 'lowerValue')] ?? fieldErrors.goals,
                }}
                focus={focus}
                goals={values.goals}
              />
            ),
          },
          { value: 'no', label: 'No' },
        ]}
      />
    </IndicatorSectionForm>
  );
}
