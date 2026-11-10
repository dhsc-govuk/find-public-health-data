// @vitest-environment jsdom
import { serviceName } from '@fphd/ui';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { ADD_INTENT, removeIntent } from '../list-form.ts';
import { noRefusal, SHOWN_VERSION } from '../testing.ts';
import type { NumeratorDenominatorPageValues } from './form.ts';
import { NumeratorDenominatorPage } from './page.tsx';

afterEach(() => {
  cleanup();
  // Server-rendered HTML is put straight into the body, which cleanup leaves alone.
  document.body.innerHTML = '';
});

const ons = {
  id: '01a0d858-9885-764e-8d53-6826aec67001',
  name: 'Office for National Statistics (ONS)',
  sources: [{ id: '01a0d858-9885-764e-8d53-6826aec67002', name: 'Annual mortality extract' }],
};
const estimated = { id: '01a0d858-9885-764e-8d53-6826aec67004', name: 'Estimated', sources: [] };
const providers = [ons, estimated];

const empty: NumeratorDenominatorPageValues = {
  sources: [],
  definition: '',
  providerId: '',
  sourceId: '',
};
const twoSources: NumeratorDenominatorPageValues = {
  ...empty,
  sources: [
    { providerId: ons.id, sourceId: ons.sources[0]?.id ?? null },
    { providerId: estimated.id, sourceId: null },
  ],
};

type Props = Parameters<typeof NumeratorDenominatorPage>[0];

// The error summary's links read router state, so the page renders inside a router.
function page(props: Partial<Props> = {}) {
  return (
    <MemoryRouter>
      <NumeratorDenominatorPage
        {...noRefusal}
        part="numerator"
        providers={providers}
        values={empty}
        {...props}
      />
    </MemoryRouter>
  );
}

function renderPage(props: Partial<Props> = {}) {
  return render(page(props));
}

/** The server's HTML alone, as a browser without JavaScript has it. */
function renderWithoutJavaScript(props: Partial<Props> = {}) {
  document.body.innerHTML = renderToString(page(props));
}

function providerSelect() {
  return screen.getByLabelText('Add a data provider for the numerator') as HTMLSelectElement;
}

function sourceSelect() {
  return screen.getByLabelText(/^Add the specific source/) as HTMLSelectElement;
}

function optionsOf(select: HTMLSelectElement) {
  return [...select.options].map((option) => option.text);
}

describe('NumeratorDenominatorPage', () => {
  it('asks about the part it is given, as the page heading and title', () => {
    renderPage({ part: 'denominator' });

    expect(
      screen.getByRole('heading', { level: 1, name: 'What are the details of the denominator?' }),
    ).toBeTruthy();
    expect(screen.getByLabelText('Add a data provider for the denominator')).toBeTruthy();
    expect(screen.getByLabelText('Enter the definition of the denominator')).toBeTruthy();
    expect(document.title).toBe(
      `What are the details of the denominator? - ${serviceName} - GOV.UK`,
    );
  });

  it('offers every provider', () => {
    renderPage();

    expect(optionsOf(providerSelect())).toEqual([
      'Select a data provider',
      'Office for National Statistics (ONS)',
      'Estimated',
    ]);
  });

  it("offers the chosen provider's sources once one is chosen, after no specific source", () => {
    renderPage();

    expect(sourceSelect().closest('[hidden]')).not.toBeNull();

    fireEvent.change(providerSelect(), { target: { value: ons.id } });

    expect(sourceSelect().closest('[hidden]')).toBeNull();
    expect(screen.getByLabelText(`Add the specific source from ${ons.name}`)).toBeTruthy();
    expect(optionsOf(sourceSelect())).toEqual([
      'Select a source',
      'No specific source',
      'Annual mortality extract',
    ]);
  });

  it('shows the sources of the provider chosen before the page was sent back', () => {
    renderPage({ values: { ...empty, providerId: estimated.id } });

    expect(sourceSelect().closest('[hidden]')).toBeNull();
    expect(optionsOf(sourceSelect())).toEqual(['Select a source', 'No specific source']);
  });

  it('sends the form as Add source would when a source is picked from the suggestions', async () => {
    const { container } = renderPage({ values: { ...empty, providerId: ons.id } });
    const submitters: (HTMLElement | null)[] = [];
    container.querySelector('form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      submitters.push(event.submitter);
    });
    // The select is a combobox too, so wait for the input that replaces it.
    const combobox = await waitFor(() => {
      const field = screen.getByRole('combobox', {
        name: `Add the specific source from ${ons.name}`,
      });
      if (!(field instanceof HTMLInputElement)) throw new Error('Not enhanced yet');
      return field;
    });
    const listbox = document.getElementById(combobox.getAttribute('aria-controls') ?? '');
    if (listbox === null) throw new Error('No suggestions');
    fireEvent.input(combobox, { target: { value: 'annual' } });

    fireEvent.click(await waitFor(() => within(listbox).getByText('Annual mortality extract')));

    expect(submitters.map((button) => button?.getAttribute('value'))).toEqual([ADD_INTENT]);
    expect(container.querySelector('select[name="sourceId"]')).toHaveProperty(
      'value',
      ons.sources[0]?.id,
    );
  });

  it('shows Add source without JavaScript', () => {
    renderWithoutJavaScript({ values: { ...empty, providerId: ons.id } });

    const addSource = screen.getByText('Add source');

    expect(addSource.getAttribute('value')).toBe(ADD_INTENT);
    expect(addSource.closest('[hidden]')).toBeNull();
  });

  it('hides Add source, but not the source field, once the page is hydrated', () => {
    renderPage({ values: { ...empty, providerId: ons.id } });

    const hidden = screen.getByText('Add source').closest('[hidden]');

    expect(hidden).not.toBeNull();
    expect(hidden?.contains(sourceSelect())).toBe(false);
  });

  it('lists the sources added, naming a provider alone where it has no specific source', () => {
    renderPage({ values: twoSources });

    const items = within(screen.getByRole('list')).getAllByRole('listitem');

    expect(items.map((item) => item.querySelector('span')?.textContent)).toEqual([
      'Office for National Statistics (ONS): Annual mortality extract',
      'Estimated',
    ]);
    expect(screen.getByRole('button', { name: 'Remove Estimated' }).getAttribute('value')).toBe(
      removeIntent(1),
    );
  });

  it('carries the added sources in hidden fields, an empty source being none specific', () => {
    const { container } = renderPage({ values: twoSources });

    const hidden = [...container.querySelectorAll('input[type="hidden"]')].map((input) => [
      input.getAttribute('name'),
      input.getAttribute('value'),
    ]);

    expect(hidden).toEqual([
      ['version', SHOWN_VERSION],
      ['sources[0].providerId', ons.id],
      ['sources[0].sourceId', ons.sources[0]?.id],
      ['sources[1].providerId', estimated.id],
      ['sources[1].sourceId', ''],
    ]);
  });

  it('lets Enter continue rather than show, add or remove a source', () => {
    const { container } = renderPage({ values: twoSources });

    const first = container.querySelector('form button');

    expect(first?.textContent).toBe('Continue');
    expect(first?.getAttribute('name')).toBeNull();
  });

  it('links a refusal of the list to the provider select', () => {
    renderPage({
      fieldErrors: { sources: 'Add at least one data provider for the numerator' },
    });

    const summaryLink = within(screen.getByRole('alert')).getByRole('link');

    expect(summaryLink.getAttribute('href')).toBe(`#${providerSelect().id}`);
    expect(providerSelect().getAttribute('aria-describedby')).toContain('providerId-error');
  });
});
