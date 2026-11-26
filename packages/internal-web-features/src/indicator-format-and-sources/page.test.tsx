// @vitest-environment jsdom
import { serviceName } from '@fphd/ui';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { noRefusal, RELATED_GUIDANCE_LINK, SHOWN_VERSION } from '../testing.ts';
import {
  ADD_DATA_VALUE_INTENT,
  addSourceIntent,
  type DataValuePageValues,
  type FormatAndSourcesPageValues,
  removeDataValueIntent,
  removeSourceIntent,
} from './form.ts';
import { FormatAndSourcesPage } from './page.tsx';

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

const blankDataValue: DataValuePageValues = {
  sources: [],
  definition: '',
  disclosureControl: '',
  disclosureControlDetail: '',
  providerId: '',
  sourceId: '',
};

const empty: FormatAndSourcesPageValues = {
  hasNumeratorDenominator: '',
  numeratorSources: [],
  numeratorDefinition: '',
  numeratorDisclosureControl: '',
  numeratorDisclosureControlDetail: '',
  numeratorProviderId: '',
  numeratorSourceId: '',
  denominatorSources: [],
  denominatorDefinition: '',
  denominatorDisclosureControl: '',
  denominatorDisclosureControlDetail: '',
  denominatorProviderId: '',
  denominatorSourceId: '',
  dataValues: [blankDataValue],
};

const twoSources: FormatAndSourcesPageValues = {
  ...empty,
  hasNumeratorDenominator: 'yes',
  numeratorSources: [
    { providerId: ons.id, sourceId: ons.sources[0]?.id ?? null },
    { providerId: estimated.id, sourceId: null },
  ],
};

type Props = Parameters<typeof FormatAndSourcesPage>[0];

// The error summary's links read router state, so the page renders inside a router.
function page(props: Partial<Props> = {}) {
  return (
    <MemoryRouter>
      <FormatAndSourcesPage {...noRefusal} providers={providers} values={empty} {...props} />
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

function providerSelect(label = 'Add a data provider for the numerator') {
  return screen.getByLabelText(label) as HTMLSelectElement;
}

function sourceSelect(name = 'numeratorSourceId') {
  const select = document.querySelector(`select[name="${name}"]`);
  if (!(select instanceof HTMLSelectElement)) throw new Error(`No select ${name}`);
  return select;
}

function optionsOf(select: HTMLSelectElement) {
  return [...select.options].map((option) => option.text);
}

function group(legend: string) {
  return within(screen.getByRole('group', { name: legend }));
}

describe('FormatAndSourcesPage', () => {
  it('asks whether the indicator has a numerator and denominator under the page heading', () => {
    renderPage();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Indicator format and sources' }),
    ).toBeTruthy();
    expect(
      group('Does this indicator have a numerator and denominator?')
        .getAllByRole('radio')
        .filter((radio) => radio.getAttribute('name') === 'hasNumeratorDenominator')
        .map((radio) => (radio as HTMLInputElement).value),
    ).toEqual(['yes', 'no']);
    expect(document.title).toBe(`Indicator format and sources - ${serviceName} - GOV.UK`);
  });

  it('links to the guidance on the numerator, under the heading', () => {
    renderPage();

    expect(screen.getByRole('link', { name: RELATED_GUIDANCE_LINK }).getAttribute('href')).toBe(
      '/publish/guidance#numerator',
    );
  });

  it('asks for the sources, definition and disclosure control of each figure under Yes', () => {
    renderPage();

    const yes = screen.getByLabelText('Yes', { selector: '#hasNumeratorDenominator-radio-0' });
    const reveal = document.getElementById(yes.getAttribute('aria-controls') ?? '');
    if (reveal === null) throw new Error('Yes reveals nothing');

    for (const part of ['numerator', 'denominator']) {
      expect(within(reveal).getByLabelText(`Add a data provider for the ${part}`)).toBeTruthy();
      expect(within(reveal).getByLabelText(`Enter the definition of the ${part}`)).toBeTruthy();
      expect(
        within(reveal)
          .getAllByRole('group', {
            name: `Has disclosure control been applied to the ${part}?`,
          })
          .flatMap((fieldset) =>
            within(fieldset)
              .getAllByRole('radio')
              .map((radio) => (radio.parentElement?.textContent ?? '').trim()),
          ),
      ).toEqual(['Yes', 'Not applicable']);
    }
  });

  it('asks for details of the disclosure control under its Yes', () => {
    renderPage();

    const question = group('Has disclosure control been applied to the numerator?');
    const details = question.getByLabelText('Provide details');

    expect(details.getAttribute('name')).toBe('numeratorDisclosureControlDetail');
    expect(details.closest('.govuk-radios__conditional')?.id).toBe(
      question.getByLabelText('Yes').getAttribute('aria-controls'),
    );
  });

  it('asks the same of each data value under No, numbering it', () => {
    renderPage({ values: { ...empty, dataValues: [blankDataValue, blankDataValue] } });

    expect(providerSelect('Add a data provider (Data value 2)').name).toBe(
      'dataValues[1].providerId',
    );
    expect(
      screen
        .getByLabelText('Enter the definition for this data (Data value 2)')
        .getAttribute('name'),
    ).toBe('dataValues[1].definition');
    expect(
      screen
        .getAllByRole('group', { name: 'Has disclosure control been applied to this data value?' })
        .map((fieldset) => within(fieldset).getAllByRole('radio')[0]?.getAttribute('name')),
    ).toEqual(['dataValues[0].disclosureControl', 'dataValues[1].disclosureControl']);
  });

  it('offers to remove each data value while there is more than one, and to add another', () => {
    renderPage({ values: { ...empty, dataValues: [blankDataValue, blankDataValue] } });

    expect(screen.getByRole('button', { name: 'Remove data value 2' }).getAttribute('value')).toBe(
      removeDataValueIntent(1),
    );
    expect(
      screen.getByRole('button', { name: 'Add another data value' }).getAttribute('value'),
    ).toBe(ADD_DATA_VALUE_INTENT);
  });

  it('offers no way to remove the only data value', () => {
    renderPage();

    expect(screen.queryByRole('button', { name: /^Remove data value/ })).toBeNull();
  });

  it('offers to add no more than 20 data values', () => {
    renderPage({ values: { ...empty, dataValues: Array(20).fill(blankDataValue) } });

    expect(screen.queryByRole('button', { name: 'Add another data value' })).toBeNull();
  });

  it('tells the publisher how to get a provider or source added, without a link', () => {
    renderPage({ values: { ...empty, numeratorProviderId: ons.id } });

    expect(
      screen.getAllByText(
        'If you cannot find a provider in the list, you can request a data provider be added.',
      ),
    ).toHaveLength(3);
    expect(
      screen.getAllByText(
        'If you cannot find a source in the list, you can request a data source be added.',
      ),
    ).toHaveLength(3);
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

  it("sends the form as that figure's Add source would when a source is picked", async () => {
    const { container } = renderPage({ values: { ...empty, denominatorProviderId: ons.id } });
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

    expect(submitters.map((button) => button?.getAttribute('value'))).toEqual([
      addSourceIntent('denominator'),
    ]);
    expect(sourceSelect('denominatorSourceId').value).toBe(ons.sources[0]?.id);
  });

  it('shows Show sources and Add source without JavaScript', () => {
    renderWithoutJavaScript({ values: { ...empty, numeratorProviderId: ons.id } });

    const addSource = screen.getAllByText('Add source')[0];

    expect(addSource?.getAttribute('value')).toBe(addSourceIntent('numerator'));
    expect(addSource?.closest('[hidden]')).toBeNull();
    expect(screen.getAllByText('Show sources')).toHaveLength(3);
  });

  it('lists the sources added, naming a provider alone where it has no specific source', () => {
    renderPage({ values: twoSources });

    const items = within(screen.getByRole('list')).getAllByRole('listitem');

    expect(items.map((item) => item.querySelector('span')?.textContent)).toEqual([
      'Office for National Statistics (ONS): Annual mortality extract',
      'Estimated',
    ]);
    expect(screen.getByRole('button', { name: 'Remove Estimated' }).getAttribute('value')).toBe(
      removeSourceIntent('numerator', 1),
    );
  });

  it('shows a source no longer offered so it can be removed', () => {
    renderPage({
      values: {
        ...empty,
        numeratorSources: [{ providerId: '01a0d858-9885-764e-8d53-6826aec67999', sourceId: null }],
      },
      fieldErrors: {
        numeratorSources:
          'Remove the data source that is no longer available, then add another if you need one',
      },
    });

    expect(
      screen.getByRole('button', { name: 'Remove Data source no longer available' }),
    ).toBeTruthy();
    expect(providerSelect().getAttribute('aria-describedby')).toContain(
      'numeratorProviderId-error',
    );
  });

  it("carries each list's sources in hidden fields named by its figure", () => {
    const { container } = renderPage({
      values: {
        ...twoSources,
        dataValues: [
          { ...blankDataValue, sources: [{ providerId: estimated.id, sourceId: null }] },
        ],
      },
    });

    const hidden = [...container.querySelectorAll('input[type="hidden"]')].map((input) => [
      input.getAttribute('name'),
      input.getAttribute('value'),
    ]);

    expect(hidden).toEqual([
      ['version', SHOWN_VERSION],
      ['numeratorSources[0].providerId', ons.id],
      ['numeratorSources[0].sourceId', ons.sources[0]?.id],
      ['numeratorSources[1].providerId', estimated.id],
      ['numeratorSources[1].sourceId', ''],
      ['dataValues[0].sources[0].providerId', estimated.id],
      ['dataValues[0].sources[0].sourceId', ''],
    ]);
  });

  it('lets Enter continue rather than show, add or remove anything', () => {
    const { container } = renderPage({ values: twoSources });

    const first = container.querySelector('form button');

    expect(first?.textContent).toBe('Continue');
    expect(first?.getAttribute('name')).toBeNull();
  });

  it('links each refusal to its control, in the order the page asks', () => {
    renderPage({
      fieldErrors: {
        'dataValues[0].disclosureControl':
          'Select whether disclosure control has been applied to data value 1',
        numeratorSources: 'Add at least one data source for the numerator',
        'dataValues[0].sources': 'Add at least one data source for data value 1',
      },
    });

    const links = within(screen.getByRole('alert')).getAllByRole('link');

    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Add at least one data source for the numerator', `#${providerSelect().id}`],
      [
        'Add at least one data source for data value 1',
        `#${providerSelect('Add a data provider (Data value 1)').id}`,
      ],
      [
        'Select whether disclosure control has been applied to data value 1',
        '#dataValues[0].disclosureControl-radio-0',
      ],
    ]);
  });
});
