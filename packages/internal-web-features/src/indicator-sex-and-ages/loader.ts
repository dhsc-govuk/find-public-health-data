// No @fphd/ui imports here, so the loader and action unit-test without the jsdom the components need.
import { sexAndAgesAnswersSchema, sexAndAgesSection } from '@fphd/internal-api-features/contract';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { versionedAction } from '../edit-version.ts';
import { requireIndicatorId } from '../indicator-id.ts';
import { loadIndicatorSectionAnswers, saveIndicatorSectionValues } from '../indicator-section.ts';
import {
  readSexAndAgesForm,
  type SexAndAgesPageState,
  withAgeRangeAdded,
  withAgeRangeRemoved,
  withAgeRangeShown,
} from './form.ts';

/** The draft's answers, with a blank range where it holds none. */
export async function loadSexAndAges(args: LoaderFunctionArgs) {
  const { id, answers, version } = await loadIndicatorSectionAnswers(
    args,
    sexAndAgesSection.key,
    sexAndAgesAnswersSchema,
  );

  return { id, values: withAgeRangeShown(sexAndAgesSection.formValues(answers)), version };
}

/**
 * Add and each remove are buttons of their own, which change the ranges and re-render the
 * page without saving: the ranges travel in the form until Continue saves them.
 */
export const submitSexAndAges = versionedAction(
  async (
    args: ActionFunctionArgs,
    { formData, version },
  ): Promise<SexAndAgesPageState | Response> => {
    const id = requireIndicatorId(args.params);
    const { intent, values } = readSexAndAgesForm(formData);

    if (intent.to === 'add') return withAgeRangeAdded(values);
    if (intent.to === 'remove') return withAgeRangeRemoved(values, intent.index);

    return saveIndicatorSectionValues(args.context, id, sexAndAgesSection, values, {
      answersSchema: sexAndAgesAnswersSchema,
      takeIn: (sent) => ({ values: sent, answers: sent }),
      version,
    });
  },
);
