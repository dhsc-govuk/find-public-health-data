// No @fphd/ui imports here, so the loader and action unit-test without the jsdom the components need.
import { sexAndAgesAnswersSchema, sexAndAgesSection } from '@fphd/internal-api-features/contract';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { versionedAction } from '../edit-version.ts';
import { requireIndicatorId } from '../indicator-id.ts';
import { loadIndicatorSectionAnswers, saveIndicatorSectionValues } from '../indicator-section.ts';
import { readSexAndAgesForm } from './form.ts';

/** The draft's answers. */
export async function loadSexAndAges(args: LoaderFunctionArgs) {
  const { id, answers, version } = await loadIndicatorSectionAnswers(
    args,
    sexAndAgesSection.key,
    sexAndAgesAnswersSchema,
  );

  return { id, values: sexAndAgesSection.formValues(answers), version };
}

export const submitSexAndAges = versionedAction(
  async (args: ActionFunctionArgs, { formData, version }) =>
    saveIndicatorSectionValues(
      args.context,
      requireIndicatorId(args.params),
      sexAndAgesSection,
      readSexAndAgesForm(formData),
      {
        answersSchema: sexAndAgesAnswersSchema,
        takeIn: (sent) => ({ values: sent, answers: sent }),
        version,
      },
    ),
);
