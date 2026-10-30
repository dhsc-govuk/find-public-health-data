// No @fphd/ui imports here, so the loader and action unit-test without the jsdom the components need.
import {
  taggingAnswersSchema,
  taggingSection,
  tagOptionsSchema,
} from '@fphd/internal-api-features/contract';
import { apiContext } from '@fphd/web-server/api-context';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { versionedAction } from '../edit-version.ts';
import { requireIndicatorId } from '../indicator-id.ts';
import { loadIndicatorSectionAnswers, saveIndicatorSectionValues } from '../indicator-section.ts';
import {
  readTaggingForm,
  type TaggingPageState,
  taggingPageValues,
  withChosenTagsTakenIn,
  withTagAdded,
  withTagRemoved,
} from './form.ts';

/** The draft's tags, and every tag the page offers. */
export async function loadTagging(args: LoaderFunctionArgs) {
  // Checked before either request, so an id that names nothing asks the API for neither.
  requireIndicatorId(args.params);

  const [{ id, answers, version }, options] = await Promise.all([
    loadIndicatorSectionAnswers(args, taggingSection.key, taggingAnswersSchema),
    args.context.get(apiContext).get('/api/internal/tags', tagOptionsSchema),
  ]);

  return { id, options, values: taggingPageValues(taggingSection.formValues(answers)), version };
}

/**
 * Each Add and Remove is a button of its own, which changes a list and re-renders the page
 * without saving: the lists travel in the form until Continue saves them, taking in any tag
 * chosen but not yet added, and a refusal re-renders the page with those tags added.
 */
export const submitTagging = versionedAction(
  async (args: ActionFunctionArgs, { formData, version }): Promise<TaggingPageState | Response> => {
    const id = requireIndicatorId(args.params);
    const { intent, values } = readTaggingForm(formData);

    if (intent.to !== 'continue' && intent.list !== undefined) {
      return intent.to === 'add'
        ? withTagAdded(values, intent.list)
        : withTagRemoved(values, intent.list, intent.index);
    }

    return saveIndicatorSectionValues(args.context, id, taggingSection, values, {
      answersSchema: taggingAnswersSchema,
      takeIn: withChosenTagsTakenIn,
      version,
    });
  },
);
