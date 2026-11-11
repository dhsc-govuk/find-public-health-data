import { expect, type Page } from '@playwright/test';

/**
 * The type-to-search input that replaces a select once the page hydrates. Until then the label
 * names the select, so this waits for the input rather than acting on the select.
 */
export function autocompleteInput(page: Page, label: string) {
  return page.getByRole('combobox', { name: label, exact: true }).and(page.locator('input'));
}

/**
 * Types an option's name and picks it from the field's own suggestions; returns the field's
 * input and listbox. For a field whose page acts on the pick at once, where the field may be
 * gone before anything more can be checked of it.
 */
export async function pickSuggestion(page: Page, label: string, option: string) {
  const input = autocompleteInput(page, label);
  await input.fill(option);
  const listbox = page.locator(`[id="${await input.getAttribute('aria-controls')}"]`);
  await listbox.getByRole('option', { name: option, exact: true }).click();

  return { input, listbox };
}

/**
 * Chooses an option by typing its name and picking it from the field's own suggestions, then
 * checks the menu closed on the pick and the hidden select holds the choice the form submits.
 */
export async function chooseOption(page: Page, label: string, option: string) {
  const { input, listbox } = await pickSuggestion(page, label, option);
  await expect(listbox).toBeHidden();
  await expect(input).toHaveValue(option);
  await expect(
    page.locator(`select[id="${await input.getAttribute('id')}-select"] option:checked`),
  ).toHaveText(option);
}
