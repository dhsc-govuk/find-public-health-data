// No @fphd/ui imports here, so the loader and action unit-test without the jsdom the components need.
import {
  benchmarkingAnswersSchema,
  benchmarkingSection,
} from '@fphd/internal-api-features/contract';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';

import { versionedAction } from '../edit-version.ts';
import { requireIndicatorId } from '../indicator-id.ts';
import { loadIndicatorSectionAnswers, saveIndicatorSectionValues } from '../indicator-section.ts';
import {
  type BenchmarkingPageState,
  readBenchmarkingForm,
  withPolicyGoalAdded,
  withPolicyGoalRemoved,
  withPolicyGoalShown,
} from './form.ts';

/** The draft's answers, with a blank goal where it holds none. */
export async function loadBenchmarking(args: LoaderFunctionArgs) {
  const { id, answers, version } = await loadIndicatorSectionAnswers(
    args,
    benchmarkingSection.key,
    benchmarkingAnswersSchema,
  );

  return { id, values: withPolicyGoalShown(benchmarkingSection.formValues(answers)), version };
}

/**
 * Add and each remove are buttons of their own, which change the goals and re-render the page
 * without saving: the goals travel in the form until Continue saves them.
 */
export const submitBenchmarking = versionedAction(
  async (
    args: ActionFunctionArgs,
    { formData, version },
  ): Promise<BenchmarkingPageState | Response> => {
    const id = requireIndicatorId(args.params);
    const { intent, values } = readBenchmarkingForm(formData);

    if (intent.to === 'add') return withPolicyGoalAdded(values);
    if (intent.to === 'remove') return withPolicyGoalRemoved(values, intent.index);

    return saveIndicatorSectionValues(args.context, id, benchmarkingSection, values, {
      answersSchema: benchmarkingAnswersSchema,
      takeIn: (sent) => ({ values: sent, answers: sent }),
      version,
    });
  },
);
