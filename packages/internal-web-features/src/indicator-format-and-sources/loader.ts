// No @fphd/ui imports here, so the loader and action unit-test without the jsdom the components need.
import {
  type DataProvider,
  dataProviderListSchema,
  type FormatAndSourcesSection,
  formatAndSourcesAnswersSchema,
  formatAndSourcesSection,
} from '@fphd/internal-api-features/contract';
import { apiContext } from '@fphd/web-server/api-context';
import type { ActionFunctionArgs, LoaderFunctionArgs, RouterContextProvider } from 'react-router';
import { versionedAction } from '../edit-version.ts';
import { requireIndicatorId } from '../indicator-id.ts';
import { loadIndicatorSectionAnswers, saveIndicatorSectionValues } from '../indicator-section.ts';
import {
  type FormatAndSourcesPageState,
  pageValuesOf,
  readFormatAndSourcesForm,
  sourcesNoLongerOffered,
  withChosenSourcesTakenIn,
  withDataValueAdded,
  withDataValueRemoved,
  withSourceAdded,
  withSourceRemoved,
  withSourcesShown,
} from './form.ts';

function loadDataProviders(context: Readonly<RouterContextProvider>): Promise<DataProvider[]> {
  return context.get(apiContext).get('/api/internal/data-providers', dataProviderListSchema);
}

/**
 * The draft's answers, with a blank data value where it holds none and nothing chosen in the
 * selects, every provider the form offers, and a refusal of each list holding a source the
 * providers list no longer offers.
 */
export async function loadFormatAndSources(args: LoaderFunctionArgs) {
  // Checked before either request, so an id that names nothing asks the API for neither.
  requireIndicatorId(args.params);

  const [{ id, answers, version }, providers] = await Promise.all([
    loadIndicatorSectionAnswers(args, formatAndSourcesSection.key, formatAndSourcesAnswersSchema),
    loadDataProviders(args.context),
  ]);
  const values = pageValuesOf(formatAndSourcesSection.formValues(answers));

  return { id, providers, values, version, fieldErrors: sourcesNoLongerOffered(values, providers) };
}

/**
 * Show sources, each Add and Remove, and Add and Remove data value are buttons of their own,
 * which change the page and re-render it without saving: the lists travel in the form until
 * Continue saves them, taking in each provider and source chosen but not yet added.
 */
export function submitFormatAndSources(
  args: ActionFunctionArgs,
  section: FormatAndSourcesSection = formatAndSourcesSection,
) {
  return versionedAction(
    async (_, { formData, version }): Promise<FormatAndSourcesPageState | Response> => {
      const id = requireIndicatorId(args.params);
      const { intent, values } = readFormatAndSourcesForm(formData);
      const providers = await loadDataProviders(args.context);

      switch (intent.to) {
        case 'show-sources':
          return withSourcesShown(values, intent.picker, providers);
        case 'add-source':
          return withSourceAdded(values, intent.picker, providers);
        case 'remove-source':
          return withSourceRemoved(values, intent.picker, intent.index, providers);
        case 'add-data-value':
          return withDataValueAdded(values, providers);
        case 'remove-data-value':
          return withDataValueRemoved(values, intent.index, providers);
        case 'continue':
          return saveIndicatorSectionValues(args.context, id, section, values, {
            answersSchema: formatAndSourcesAnswersSchema,
            takeIn: (sent) => withChosenSourcesTakenIn(section, sent, providers),
            version,
          });
      }
    },
  )(args);
}
