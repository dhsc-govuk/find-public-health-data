// No @fphd/ui imports here, so the loader unit-tests without the jsdom the components need.
import {
  valueTypeAndUnitOptionsSchema,
  valueTypeAndUnitsSection,
} from '@fphd/internal-api-features/contract';
import { apiContext } from '@fphd/web-server/api-context';
import type { LoaderFunctionArgs } from 'react-router';

import { requireIndicatorId } from '../indicator-id.ts';
import { loadIndicatorSection } from '../indicator-section.ts';

/** The draft's answers, and every value type the form offers. */
export async function loadValueTypeAndUnits(args: LoaderFunctionArgs) {
  // Checked before either request, so an id that names nothing asks the API for neither.
  requireIndicatorId(args.params);

  const [section, options] = await Promise.all([
    loadIndicatorSection(args, valueTypeAndUnitsSection),
    args.context
      .get(apiContext)
      .get('/api/internal/value-types-and-units', valueTypeAndUnitOptionsSchema),
  ]);

  return { ...section, ...options };
}
