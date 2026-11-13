// No @fphd/ui imports here, so the loader and action unit-test without the jsdom the components need.
import { agesAnswersSchema, agesSection } from '@fphd/internal-api-features/contract';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { versionedAction } from '../edit-version.ts';
import { requireIndicatorId } from '../indicator-id.ts';
import { loadIndicatorSectionAnswers, saveIndicatorSectionValues } from '../indicator-section.ts';
import {
  type AgesPageState,
  readAgesForm,
  withAgeRangeAdded,
  withAgeRangeRemoved,
  withAgeRangeShown,
} from './form.ts';

/** The draft's answers, with a blank range where it holds none. */
export async function loadAges(args: LoaderFunctionArgs) {
  const { id, answers, version } = await loadIndicatorSectionAnswers(
    args,
    agesSection.key,
    agesAnswersSchema,
  );

  return { id, values: withAgeRangeShown(agesSection.formValues(answers)), version };
}

/**
 * Add and each remove are buttons of their own, which change the ranges and re-render the
 * page without saving: the ranges travel in the form until Continue saves them.
 */
export const submitAges = versionedAction(
  async (args: ActionFunctionArgs, { formData, version }): Promise<AgesPageState | Response> => {
    const id = requireIndicatorId(args.params);
    const { intent, values } = readAgesForm(formData);

    if (intent.to === 'add') return withAgeRangeAdded(values);
    if (intent.to === 'remove') return withAgeRangeRemoved(values, intent.index);

    return saveIndicatorSectionValues(args.context, id, agesSection, values, {
      answersSchema: agesAnswersSchema,
      takeIn: (sent) => ({ values: sent, answers: sent }),
      version,
    });
  },
);
