// No @fphd/ui imports here, so the loader and action unit-test without the jsdom the components need.
import {
  areProviderSourcesOffered,
  type DataProvider,
  dataProviderListSchema,
  type ProviderSourcesSection,
  providerSourcesAnswersSchema,
} from '@fphd/internal-api-features/contract';
import { apiContext } from '@fphd/web-server/api-context';
import type { ActionFunctionArgs, LoaderFunctionArgs, RouterContextProvider } from 'react-router';
import { versionedAction } from '../edit-version.ts';
import { requireIndicatorId } from '../indicator-id.ts';
import { loadIndicatorSectionAnswers, saveIndicatorSectionValues } from '../indicator-section.ts';
import {
  type NumeratorDenominatorPageState,
  type NumeratorDenominatorPageValues,
  readNumeratorDenominatorForm,
  withChosenSourceTakenIn,
  withSourceAdded,
  withSourceRemoved,
  withSourcesShown,
} from './form.ts';

function loadDataProviders(context: Readonly<RouterContextProvider>): Promise<DataProvider[]> {
  return context.get(apiContext).get('/api/internal/data-providers', dataProviderListSchema);
}

/** The draft's answers, with nothing chosen in the selects, and every provider the form offers. */
export async function loadNumeratorDenominator(
  args: LoaderFunctionArgs,
  section: ProviderSourcesSection,
) {
  // Checked before either request, so an id that names nothing asks the API for neither.
  requireIndicatorId(args.params);

  const [{ id, answers, version }, providers] = await Promise.all([
    loadIndicatorSectionAnswers(args, section.key, providerSourcesAnswersSchema),
    loadDataProviders(args.context),
  ]);
  const values: NumeratorDenominatorPageValues = {
    ...section.formValues(answers),
    providerId: '',
    sourceId: '',
  };

  return { id, providers, values, version };
}

/**
 * Show sources, Add and each remove are buttons of their own, which change the page and
 * re-render it without saving: the list travels in the form until Continue saves it, taking
 * in a provider and source chosen but not yet added.
 */
export function submitNumeratorDenominator(
  args: ActionFunctionArgs,
  section: ProviderSourcesSection,
) {
  return versionedAction(
    async (_, { formData, version }): Promise<NumeratorDenominatorPageState | Response> => {
      const id = requireIndicatorId(args.params);
      const { intent, values } = readNumeratorDenominatorForm(formData);
      const providers = await loadDataProviders(args.context);

      // The page only lists sources the providers offer, so any other was not sent by it.
      if (!areProviderSourcesOffered(values.sources, providers)) {
        throw new Response('Bad Request', { status: 400 });
      }

      if (intent.to === 'show-sources') return withSourcesShown(values, providers);
      if (intent.to === 'add') return withSourceAdded(section.key, values, providers);
      if (intent.to === 'remove') return withSourceRemoved(values, intent.index);

      return saveIndicatorSectionValues(args.context, id, section, values, {
        answersSchema: providerSourcesAnswersSchema,
        takeIn: (sent) => withChosenSourceTakenIn(section, sent, providers),
        version,
      });
    },
  )(args);
}
