// No @fphd/ui imports here, so the loader and action unit-test without the jsdom the components need.
import {
  calculationResponseSchema,
  calculationSection,
  calculationSectionFor,
} from '@fphd/internal-api-features/contract';
import { standardCalculationMethodOf } from '@fphd/utils/standard-methods';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';

import { loadIndicatorSectionResponse, saveIndicatorSection } from '../indicator-section.ts';

/** The draft's value type, and its standard calculation method or null where it has none. */
export interface CalculationValueTypeSummary {
  name: string;
  standardMethod: string | null;
}

/** The draft's answers, and the value type that decides what the page asks about the method. */
export async function loadCalculation(args: LoaderFunctionArgs) {
  const { id, answers, version, valueType } = await loadIndicatorSectionResponse(
    args,
    calculationSection.key,
    calculationResponseSchema,
  );
  const summary: CalculationValueTypeSummary | null =
    valueType === null
      ? null
      : { name: valueType.name, standardMethod: standardCalculationMethodOf(valueType.id) };

  return { id, values: calculationSection.formValues(answers), version, valueType: summary };
}

/**
 * Saves the answers, judged first by the draft's value type as it is now, which the API judges
 * them by again.
 */
export async function saveCalculation(args: ActionFunctionArgs) {
  const { valueType } = await loadIndicatorSectionResponse(
    args,
    calculationSection.key,
    calculationResponseSchema,
  );

  return saveIndicatorSection(args, calculationSectionFor(valueType?.id ?? null));
}
