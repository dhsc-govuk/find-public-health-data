import {
  type IndicatorTaskStatus,
  type IndicatorTaskStatuses,
  indicatorTaskKeySchema,
} from '@fphd/internal-api-features/contract';

import type { SectionPageProps } from './indicator-section-form.tsx';

/** A version as the API gives one, for a form to send back. */
export const SHOWN_VERSION = 'a'.repeat(64);

/** A section page's props when the last submission was not refused, for page tests. */
export const noRefusal: Omit<SectionPageProps<never, unknown>, 'values'> = {
  fieldErrors: {},
  formError: undefined,
  version: SHOWN_VERSION,
};

/** Every task at the one status, for a task list to start from. */
export function taskStatuses(status: IndicatorTaskStatus): IndicatorTaskStatuses {
  return Object.fromEntries(
    indicatorTaskKeySchema.options.map((key) => [key, status]),
  ) as IndicatorTaskStatuses;
}
