import { CHECK_COLUMN_KEYS, type CheckColumnKey } from '@fphd/internal-api-features/contract';
import { isOneOf } from '@fphd/utils/is-one-of';

/**
 * The hidden field that marks the column filters form, which tells it apart from the check page's
 * other form, Continue. Pressing Enter before the page's scripts are ready sends a form with no
 * button, so the buttons alone can't.
 */
export const FORM_FIELD = 'form';
export const COLUMN_FILTERS_FORM = 'column-filters';

/** What the column filters form was sent to do. Its buttons are named `intent`. */
export type ColumnFilterIntent =
  | { to: 'search' }
  | { to: 'show'; column: CheckColumnKey }
  | { to: 'add' };

/** The value of the button that finds the values containing the search. */
export const SEARCH_VALUES_INTENT = 'search-values';

/** The value of the button that adds the ticked values to the filters. */
export const ADD_VALUES_INTENT = 'add-values';

const SHOW_VALUES = 'show-values-';

/** The value of the button that lists a column's values. */
export function showValuesIntent(column: CheckColumnKey): string {
  return `${SHOW_VALUES}${column}`;
}

/**
 * What the column filters form was sent to do, or undefined for another form. It searches unless
 * the button that sent it says otherwise.
 */
export function readColumnFilterIntent(formData: FormData): ColumnFilterIntent | undefined {
  if (formData.get(FORM_FIELD) !== COLUMN_FILTERS_FORM) return undefined;

  const intent = formData.get('intent');

  if (typeof intent !== 'string') return { to: 'search' };
  if (intent === ADD_VALUES_INTENT) return { to: 'add' };

  const column = intent.startsWith(SHOW_VALUES) ? intent.slice(SHOW_VALUES.length) : undefined;
  return isOneOf(CHECK_COLUMN_KEYS, column) ? { to: 'show', column } : { to: 'search' };
}
