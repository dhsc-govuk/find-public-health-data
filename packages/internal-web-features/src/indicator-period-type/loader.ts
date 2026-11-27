// No @fphd/ui imports here, so the loader and action unit-test without the jsdom the components need.
import { periodTypeAnswersSchema, periodTypeSection } from '@fphd/internal-api-features/contract';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';

import { versionedAction } from '../edit-version.ts';
import { requireIndicatorId } from '../indicator-id.ts';
import { loadIndicatorSectionAnswers, saveIndicatorSectionValues } from '../indicator-section.ts';
import { readPeriodTypeForm } from './form.ts';

/** The draft's answers. */
export async function loadPeriodType(args: LoaderFunctionArgs) {
  const { id, answers, version } = await loadIndicatorSectionAnswers(
    args,
    periodTypeSection.key,
    periodTypeAnswersSchema,
  );

  return { id, values: periodTypeSection.formValues(answers), version };
}

export const submitPeriodType = versionedAction(
  async (args: ActionFunctionArgs, { formData, version }) =>
    saveIndicatorSectionValues(
      args.context,
      requireIndicatorId(args.params),
      periodTypeSection,
      readPeriodTypeForm(formData),
      {
        answersSchema: periodTypeAnswersSchema,
        takeIn: (sent) => ({ values: sent, answers: sent }),
        version,
      },
    ),
);
