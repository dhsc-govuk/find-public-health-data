import { describe, expect, it } from 'vitest';

import {
  ADD_INTENT,
  addIntent,
  focusesItem,
  focusesPicker,
  listFocus,
  readListIntent,
  readListItems,
  removeIntent,
  withListFocus,
} from './list-form.ts';

function formData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.append(name, value);
  return data;
}

describe('readListIntent', () => {
  it.each([
    [{ intent: ADD_INTENT }, { to: 'add' }],
    [{ intent: removeIntent(1) }, { to: 'remove', index: 1 }],
    [{}, { to: 'continue' }],
    [{ intent: 'something-else' }, { to: 'continue' }],
    [{ intent: 'remove-' }, { to: 'continue' }],
    [{ intent: 'add-1' }, { to: 'continue' }],
  ])('reads the button that sent %o', (fields, intent) => {
    expect(readListIntent(formData(fields))).toEqual(intent);
  });

  it.each([
    [{ intent: addIntent('topics') }, { to: 'add', list: 'topics' }],
    [{ intent: removeIntent(2, 'frameworks') }, { to: 'remove', index: 2, list: 'frameworks' }],
    [{ intent: 'remove-topics' }, { to: 'continue' }],
    [{ intent: addIntent('unknown') }, { to: 'continue' }],
  ])('reads the list a button names on a form with several: %o', (fields, intent) => {
    expect(readListIntent(formData(fields), ['topics', 'frameworks'])).toEqual(intent);
  });
});

describe('readListItems', () => {
  const name = (index: number, part: string) => `items[${index}].${part}`;

  it('reads each item in order until one is missing, a part not sent being empty', () => {
    const data = formData({
      'items[0].url': 'https://a.test',
      'items[0].text': 'A',
      'items[1].url': 'https://b.test',
      'items[3].url': 'https://d.test',
    });

    expect(readListItems(data, ['url', 'text'], name)).toEqual([
      { url: 'https://a.test', text: 'A' },
      { url: 'https://b.test', text: '' },
    ]);
  });

  it('reads no items from a form carrying none', () => {
    expect(readListItems(formData({ 'items[0].text': 'A' }), ['url', 'text'], name)).toEqual([]);
  });
});

describe('listFocus', () => {
  it.each([
    ['the item added', { to: 'add' } as const, 3, { on: 'item', index: 2 }],
    [
      'the item before the one removed',
      { to: 'remove', index: 2 } as const,
      2,
      { on: 'item', index: 1 },
    ],
    [
      'the new first item when the first is removed',
      { to: 'remove', index: 0 } as const,
      2,
      { on: 'item', index: 0 },
    ],
  ])('moves to %s on a list of items', (_, intent, count, focus) => {
    expect(listFocus(intent, 'items', count)).toEqual(focus);
  });

  it('goes back to the select of a list built from one, naming the list', () => {
    expect(listFocus({ to: 'add', list: 'topics' }, 'picker', 1)).toEqual({
      on: 'picker',
      list: 'topics',
    });
    expect(listFocus({ to: 'remove', index: 0 }, 'picker', 0)).toEqual({ on: 'picker' });
  });

  it('moves nothing on Continue', () => {
    expect(listFocus({ to: 'continue' }, 'items', 1)).toBeUndefined();
  });
});

describe('withListFocus', () => {
  it('adds where focus goes to the page an Add re-renders', () => {
    const state = { values: {}, fieldErrors: {} };

    expect(withListFocus(state, { to: 'add' }, 'items', 2)).toEqual({
      ...state,
      focus: { on: 'item', index: 1 },
    });
  });

  it('moves nothing when the Add is refused, so the error summary keeps focus', () => {
    const refused = { values: {}, fieldErrors: { addTag: 'Select a tag' } };
    const failed = { values: {}, fieldErrors: {}, formError: 'Try again' };

    expect(withListFocus(refused, { to: 'add' }, 'picker', 0)).toEqual(refused);
    expect(withListFocus(failed, { to: 'add' }, 'picker', 0)).toEqual(failed);
  });
});

describe('focusesItem and focusesPicker', () => {
  it('match only the item or select of the list named', () => {
    const item = { on: 'item', index: 1, list: 'goals' } as const;
    const picker = { on: 'picker', list: 'topics' } as const;

    expect(focusesItem(item, 1, 'goals')).toBe(true);
    expect(focusesItem(item, 0, 'goals')).toBe(false);
    expect(focusesItem(item, 1)).toBe(false);
    expect(focusesItem(undefined, 0)).toBe(false);
    expect(focusesPicker(picker, 'topics')).toBe(true);
    expect(focusesPicker(picker, 'frameworks')).toBe(false);
    expect(focusesPicker(item, 'goals')).toBe(false);
  });
});
