// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SelectAutocomplete } from './select-autocomplete.tsx';

afterEach(cleanup);

const OPTIONS = [
  { label: 'Select a fruit', value: '' },
  { label: 'Apple', value: 'apple-id' },
  { label: 'Pineapple', value: 'pineapple-id' },
  { label: 'Pear', value: 'pear-id' },
];

// A select is a combobox too, so wait for the input that replaces it.
async function enhancedCombobox(): Promise<HTMLInputElement> {
  return waitFor(() => {
    const combobox = screen.getByRole('combobox', { name: 'Choose a fruit' });
    if (!(combobox instanceof HTMLInputElement)) throw new Error('Not enhanced yet');
    return combobox;
  });
}

function suggestions(): HTMLElement[] {
  return within(screen.getByRole('listbox')).getAllByRole('option');
}

function hiddenSelect(): HTMLSelectElement {
  const select = document.querySelector('select[name="fruit"]');
  if (!(select instanceof HTMLSelectElement)) throw new Error('No select');
  return select;
}

describe('SelectAutocomplete', () => {
  it('server renders a labelled select with every option', () => {
    const html = renderToString(
      <SelectAutocomplete label="Choose a fruit" name="fruit" options={OPTIONS} />,
    );

    expect(html).toMatch(/<label for="fruit-input"[^>]*>Choose a fruit<\/label>/);
    expect(html).toContain('<select class="govuk-select" id="fruit-input" name="fruit">');
    expect(html).toContain('<option value="">Select a fruit</option>');
  });

  it('puts a combobox in front of the select, which it hides and renames', async () => {
    render(<SelectAutocomplete label="Choose a fruit" name="fruit" options={OPTIONS} />);

    const combobox = await enhancedCombobox();

    expect(combobox.id).toBe('fruit-input');
    expect(hiddenSelect().id).toBe('fruit-input-select');
    expect(hiddenSelect().className).toContain('govuk-!-display-none');
  });

  it('suggests the matching options, leaving out the prompt', async () => {
    render(<SelectAutocomplete label="Choose a fruit" name="fruit" options={OPTIONS} />);
    const combobox = await enhancedCombobox();

    fireEvent.input(combobox, { target: { value: 'app' } });

    await waitFor(() =>
      expect(suggestions().map((option) => option.textContent)).toEqual(['Apple', 'Pineapple']),
    );
  });

  it('sets a picked option on the select and reports it as a change', async () => {
    const onChange = vi.fn();
    render(
      <SelectAutocomplete
        label="Choose a fruit"
        name="fruit"
        onChange={(event) => onChange(event.target.value)}
        options={OPTIONS}
      />,
    );
    const combobox = await enhancedCombobox();
    fireEvent.input(combobox, { target: { value: 'pea' } });

    fireEvent.click(await waitFor(() => within(screen.getByRole('listbox')).getByText('Pear')));

    expect(hiddenSelect().value).toBe('pear-id');
    expect(onChange).toHaveBeenCalledWith('pear-id');
    await waitFor(() => expect(combobox).toHaveProperty('value', 'Pear'));
  });

  it('reports an option picked from the suggestions as a pick', async () => {
    const onPick = vi.fn();
    render(
      <SelectAutocomplete label="Choose a fruit" name="fruit" onPick={onPick} options={OPTIONS} />,
    );
    const combobox = await enhancedCombobox();
    fireEvent.input(combobox, { target: { value: 'pea' } });

    fireEvent.click(await waitFor(() => within(screen.getByRole('listbox')).getByText('Pear')));

    expect(onPick).toHaveBeenCalledExactlyOnceWith('pear-id');
  });

  it.each([
    [
      'Escape closes the suggestions',
      (option: HTMLElement) => fireEvent.keyDown(option, { key: 'Escape', keyCode: 27 }),
    ],
    [
      'the user leaves the field',
      (option: HTMLElement) => fireEvent.blur(option, { relatedTarget: null }),
    ],
  ])('does not report a highlighted option as a pick when %s', async (_, leave) => {
    const onPick = vi.fn();
    render(
      <SelectAutocomplete label="Choose a fruit" name="fruit" onPick={onPick} options={OPTIONS} />,
    );
    const combobox = await enhancedCombobox();
    fireEvent.input(combobox, { target: { value: 'pea' } });
    await waitFor(() => expect(suggestions()).toHaveLength(1));
    fireEvent.keyDown(combobox, { key: 'ArrowDown', keyCode: 40 });
    const highlighted = await waitFor(() => {
      const option = document.querySelector('.autocomplete__option--focused');
      if (!(option instanceof HTMLElement)) throw new Error('Nothing highlighted yet');
      return option;
    });

    leave(highlighted);

    expect(onPick).not.toHaveBeenCalled();
    expect(hiddenSelect().value).toBe('');
  });

  it('does not report an option whose name is typed in full as a pick', async () => {
    const onPick = vi.fn();
    render(
      <SelectAutocomplete label="Choose a fruit" name="fruit" onPick={onPick} options={OPTIONS} />,
    );
    const combobox = await enhancedCombobox();

    fireEvent.input(combobox, { target: { value: 'apple' } });

    expect(hiddenSelect().value).toBe('apple-id');
    expect(onPick).not.toHaveBeenCalled();
  });

  it('unsets the choice when the text no longer names it', async () => {
    const onChange = vi.fn();
    render(
      <SelectAutocomplete
        defaultValue="pear-id"
        label="Choose a fruit"
        name="fruit"
        onChange={(event) => onChange(event.target.value)}
        options={OPTIONS}
      />,
    );
    const combobox = await enhancedCombobox();

    fireEvent.input(combobox, { target: { value: 'Pea' } });

    expect(hiddenSelect().value).toBe('');
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('takes an option whose name is typed in full', async () => {
    render(<SelectAutocomplete label="Choose a fruit" name="fruit" options={OPTIONS} />);
    const combobox = await enhancedCombobox();

    fireEvent.input(combobox, { target: { value: 'apple' } });

    expect(hiddenSelect().value).toBe('apple-id');
  });

  it("starts the combobox with the select's choice", async () => {
    render(
      <SelectAutocomplete
        defaultValue="apple-id"
        label="Choose a fruit"
        name="fruit"
        options={OPTIONS}
      />,
    );

    const combobox = await enhancedCombobox();

    expect(combobox).toHaveProperty('value', 'Apple');
  });

  it('shows an error above the field and marks the select', () => {
    const html = renderToString(
      <SelectAutocomplete
        error="Select a fruit"
        label="Choose a fruit"
        name="fruit"
        options={OPTIONS}
      />,
    );

    expect(html).toContain('govuk-form-group--error');
    expect(html).toMatch(/id="fruit-error".*<select aria-describedby="fruit-error"/);
    expect(html).toContain('govuk-select govuk-select--error');
  });
});
