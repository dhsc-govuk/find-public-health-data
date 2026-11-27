import { isOneOf } from '@fphd/utils/is-one-of';

import type { FormRefusal } from './form-refusal.ts';
import { type ControlNames, type FormValues, readFormValues } from './form-values.ts';

/**
 * Which button sent a form that builds lists: an Add, the Remove of one item, or Continue.
 * Continue has no name, so a form sent any other way continues. A form with several lists
 * names the one each button changes; a form with one names none.
 */
export type ListIntent<List extends string = never> =
  | { to: 'add'; list?: List }
  | { to: 'remove'; index: number; list?: List }
  | { to: 'continue' };

/** The value of the Add button, which is named `intent`. */
export const ADD_INTENT = 'add';

/** The value of the Add button of `list`, on a form with several. */
export function addIntent(list?: string): string {
  return list === undefined ? ADD_INTENT : `${ADD_INTENT}-${list}`;
}

/** The value of the button, named `intent`, that removes the item at `index` of `list`. */
export function removeIntent(index: number, list?: string): string {
  return list === undefined ? `remove-${index}` : `remove-${list}-${index}`;
}

const INTENT = /^(add|remove)(?:-([A-Za-z]+))?(?:-(\d+))?$/;

/** The button that sent the form; one naming a list not in `lists` continues. */
export function readListIntent<List extends string = never>(
  formData: FormData,
  lists: readonly List[] = [],
): ListIntent<List> {
  const intent = formData.get('intent');
  const [, to, list, index] = (typeof intent === 'string' && INTENT.exec(intent)) || [];
  if (list !== undefined && !isOneOf(lists, list)) return { to: 'continue' };

  const named = list === undefined ? {} : { list };
  if (to === 'add' && index === undefined) return { to: 'add', ...named };
  if (to === 'remove' && index !== undefined)
    return { to: 'remove', index: Number(index), ...named };

  return { to: 'continue' };
}

/**
 * How a list is built: from items whose fields are typed in place, such as age ranges, or by
 * choosing each value in a select and pressing Add, such as tags.
 */
export type ListKind = 'items' | 'picker';

/**
 * Where focus goes when the page comes back after an Add or a Remove, so that a keyboard or
 * screen reader user carries on from the list they changed rather than from the top of the page:
 * the first field of the item at `index`, or the select that adds to the list.
 */
export type ListFocus<List extends string = never> =
  | { on: 'item'; index: number; list?: List }
  | { on: 'picker'; list?: List };

/**
 * Where focus goes after the button `intent` names changed a list that now holds `count` items.
 * On a list of items, Add moves to the item added, and Remove to the item before the one removed,
 * or to the first item if the first was removed. On a list built from a select, both go back to
 * that select. Continue moves nothing.
 */
export function listFocus<List extends string = never>(
  intent: ListIntent<List>,
  kind: ListKind,
  count: number,
): ListFocus<List> | undefined {
  if (intent.to === 'continue') return undefined;

  const named = intent.list === undefined ? {} : { list: intent.list };
  if (kind === 'picker') return { on: 'picker', ...named };

  const index = intent.to === 'add' ? count - 1 : intent.index - 1;
  return { on: 'item', index: Math.max(0, Math.min(index, count - 1)), ...named };
}

/**
 * The page as the button `intent` names re-renders it, with where focus goes in a list that now
 * holds `count` items. A refused Add moves nothing, so the error summary keeps focus.
 */
export function withListFocus<State extends FormRefusal<string>, List extends string = never>(
  state: State,
  intent: ListIntent<List>,
  kind: ListKind,
  count: number,
): State & { focus?: ListFocus<List> } {
  const refused = Object.keys(state.fieldErrors).length > 0 || state.formError !== undefined;
  const focus = refused ? undefined : listFocus(intent, kind, count);

  return focus === undefined ? state : { ...state, focus };
}

/** Whether `focus` is on the first field of the item at `index` of `list`. */
export function focusesItem(
  focus: ListFocus<string> | undefined,
  index: number,
  list?: string,
): boolean {
  return focus?.on === 'item' && focus.index === index && focus.list === list;
}

/** Whether `focus` is on the select that adds to `list`. */
export function focusesPicker(focus: ListFocus<string> | undefined, list?: string): boolean {
  return focus?.on === 'picker' && focus.list === list;
}

/**
 * Each item of a list the form carries, one field per part named by `name`, from the first
 * until one whose first part was not sent.
 */
export function readListItems<Part extends string>(
  formData: FormData,
  parts: readonly Part[],
  name: (index: number, part: Part) => string,
): FormValues<Part>[] {
  const [first] = parts;
  const items: FormValues<Part>[] = [];

  for (let index = 0; first !== undefined && formData.has(name(index, first)); index++) {
    const names = Object.fromEntries(
      parts.map((part) => [part, name(index, part)]),
    ) as ControlNames<Part>;
    items.push(readFormValues(formData, parts, names));
  }

  return items;
}
