// No @fphd/ui imports here, so the loader and action unit-test without the jsdom the components need.
import {
  sexGenderAndEthnicityAnswersSchema,
  sexGenderAndEthnicitySection,
} from '@fphd/internal-api-features/contract';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { versionedAction } from '../edit-version.ts';
import { requireIndicatorId } from '../indicator-id.ts';
import { loadIndicatorSectionAnswers, saveIndicatorSectionValues } from '../indicator-section.ts';
import { readSexGenderAndEthnicityForm } from './form.ts';

/** The draft's answers. */
export async function loadSexGenderAndEthnicity(args: LoaderFunctionArgs) {
  const { id, answers, version } = await loadIndicatorSectionAnswers(
    args,
    sexGenderAndEthnicitySection.key,
    sexGenderAndEthnicityAnswersSchema,
  );

  return { id, values: sexGenderAndEthnicitySection.formValues(answers), version };
}

export const submitSexGenderAndEthnicity = versionedAction(
  async (args: ActionFunctionArgs, { formData, version }) =>
    saveIndicatorSectionValues(
      args.context,
      requireIndicatorId(args.params),
      sexGenderAndEthnicitySection,
      readSexGenderAndEthnicityForm(formData),
      {
        answersSchema: sexGenderAndEthnicityAnswersSchema,
        takeIn: (sent) => ({ values: sent, answers: sent }),
        version,
      },
    ),
);
