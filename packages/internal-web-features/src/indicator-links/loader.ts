// No @fphd/ui imports here, so the loader and action unit-test without the jsdom the components need.
import { linksAnswersSchema, linksSection } from '@fphd/internal-api-features/contract';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { versionedAction } from '../edit-version.ts';
import { requireIndicatorId } from '../indicator-id.ts';
import { loadIndicatorSectionAnswers, saveIndicatorSectionValues } from '../indicator-section.ts';
import {
  type LinksPageState,
  type LinksPageValues,
  readLinksForm,
  withLinkAdded,
  withLinkRemoved,
  withTypedLinkTakenIn,
} from './form.ts';

/** The draft's answers, with nothing typed in the fields that add a link. */
export async function loadLinks(args: LoaderFunctionArgs) {
  const { id, answers, version } = await loadIndicatorSectionAnswers(
    args,
    linksSection.key,
    linksAnswersSchema,
  );
  const values: LinksPageValues = {
    ...linksSection.formValues(answers),
    linkUrl: '',
    linkText: '',
  };

  return { id, values, version };
}

/**
 * Add and each remove are buttons of their own, which change the list and re-render the
 * page without saving: the list travels in the form until Continue saves it, taking in a
 * link typed but not yet added.
 */
export const submitLinks = versionedAction(
  async (args: ActionFunctionArgs, { formData, version }): Promise<LinksPageState | Response> => {
    const id = requireIndicatorId(args.params);
    const { intent, values } = readLinksForm(formData);

    if (intent.to === 'add') return withLinkAdded(values);
    if (intent.to === 'remove') return withLinkRemoved(values, intent.index);

    return saveIndicatorSectionValues(args.context, id, linksSection, values, {
      answersSchema: linksAnswersSchema,
      takeIn: withTypedLinkTakenIn,
      version,
    });
  },
);
