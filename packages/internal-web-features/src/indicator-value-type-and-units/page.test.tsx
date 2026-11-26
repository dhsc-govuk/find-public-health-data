// @vitest-environment jsdom
import { ENTER_POPULATION } from '@fphd/internal-api-features/contract';
import { serviceName } from '@fphd/ui';
import { VALUE_TYPE_IDS } from '@fphd/utils/value-type-and-unit';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { noRefusal } from '../testing.ts';
import { ValueTypeAndUnitsPage } from './page.tsx';

afterEach(() => {
  cleanup();
  // The server-rendered cases write the body directly, which cleanup does not know about.
  document.body.innerHTML = '';
});

const TITLE = 'Value types, counts and units';

const empty = {
  valueTypeId: '',
  standardPopulation: '',
  standardPopulationOther: '',
  referencePopulation: '',
  hasCount: '',
  countMeasure: '',
  countMeasureDetail: '',
  countIsEstimate: '',
  ratePer: '',
  rateObject: '',
  rateObjectDetail: '',
  valueSameAsCount: '',
  valueMeasure: '',
  valueMeasureDetail: '',
  gapObject: '',
  gapObjectDetail: '',
  ratioFormat: '',
};

const STANDARD_POPULATION = 'What standard population has been used?';

const VALUE_TYPES = [
  { id: VALUE_TYPE_IDS.count, name: 'Count' },
  { id: VALUE_TYPE_IDS.crudeRate, name: 'Crude rate' },
  { id: VALUE_TYPE_IDS.directlyStandardisedRate, name: 'Directly standardised rate' },
  { id: VALUE_TYPE_IDS.gap, name: 'Gap' },
  {
    id: VALUE_TYPE_IDS.indirectlyStandardisedProportion,
    name: 'Indirectly standardised proportion',
  },
  { id: VALUE_TYPE_IDS.indirectlyStandardisedRate, name: 'Indirectly standardised rate' },
  { id: VALUE_TYPE_IDS.indirectlyStandardisedRatio, name: 'Indirectly standardised ratio' },
  { id: VALUE_TYPE_IDS.lifeExpectancy, name: 'Life expectancy' },
  { id: VALUE_TYPE_IDS.mean, name: 'Mean' },
  { id: VALUE_TYPE_IDS.proportion, name: 'Proportion' },
  { id: VALUE_TYPE_IDS.ratio, name: 'Ratio' },
  { id: VALUE_TYPE_IDS.score, name: 'Score' },
];

type Props = Parameters<typeof ValueTypeAndUnitsPage>[0];

function page(props: Partial<Props>) {
  // The error summary's links read router state, so the page renders inside a router.
  return (
    <MemoryRouter>
      <ValueTypeAndUnitsPage {...noRefusal} values={empty} valueTypes={VALUE_TYPES} {...props} />
    </MemoryRouter>
  );
}

/** Rendered and hydrated, as a browser running JavaScript has it. */
function renderPage(props: Partial<Props> = {}) {
  return render(page(props));
}

/** The server's HTML alone, as a browser without JavaScript has it. */
function renderWithoutJavaScript(props: Partial<Props> = {}) {
  document.body.innerHTML = renderToString(page(props));
}

function input(name: string) {
  return document.getElementById(`${name}-input`) as HTMLInputElement | HTMLSelectElement;
}

function choose(name: string, value: string) {
  fireEvent.change(input(name), { target: { value } });
}

function radio(name: string, value: string) {
  const found = document.querySelector<HTMLInputElement>(`input[name="${name}"][value="${value}"]`);
  if (found === null) throw new Error(`no ${value} radio for ${name}`);
  return found;
}

function answer(name: string, value: string) {
  fireEvent.click(radio(name, value));
}

function shown(element: Element) {
  return element.closest('[hidden]') === null;
}

// Found even when hidden, which the role query otherwise skips.
function standardPopulationQuestion() {
  return screen.getByRole('group', { name: STANDARD_POPULATION, hidden: true });
}

/** The text of whatever describes this control. */
function description(element: HTMLElement) {
  return (element.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .map((id) => document.getElementById(id)?.textContent)
    .join(' ');
}

function optionsOf(select: HTMLSelectElement) {
  return [...select.options].map((option) => [option.value, option.text]);
}

function preview() {
  const heading = screen.queryByRole('heading', { name: 'Preview of counts and values' });
  if (heading === null) return null;
  return [...(heading.parentElement?.querySelectorAll('.govuk-summary-list__row') ?? [])].map(
    (row) => [...row.children].map((cell) => cell.textContent),
  );
}

const FOLLOW_UPS = [
  'hasCount',
  'countMeasure',
  'ratePer',
  'rateObject',
  'valueSameAsCount',
  'valueMeasure',
  'gapObject',
  'ratioFormat',
] as const;

/** The follow-ups after the value type that show. */
function askedFollowUps() {
  return FOLLOW_UPS.filter((name) =>
    name === 'hasCount' || name === 'valueSameAsCount' || name === 'ratioFormat'
      ? shown(radio(name, name === 'ratioFormat' ? 'number' : 'yes'))
      : shown(input(name)),
  );
}

describe('ValueTypeAndUnitsPage', () => {
  it('offers the value types it is given, in order, after an empty choice', () => {
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: TITLE })).toBeTruthy();
    const valueType = screen.getByLabelText('What is the value type?') as HTMLSelectElement;
    expect(valueType.getAttribute('name')).toBe('valueTypeId');
    expect(optionsOf(valueType)).toEqual([
      ['', 'Select'],
      ...VALUE_TYPES.map(({ id, name }) => [id, name]),
    ]);
  });

  it('offers the measures, rate numbers, rate objects and gap objects', () => {
    renderPage();

    expect(optionsOf(input('countMeasure') as HTMLSelectElement).map(([, label]) => label)).toEqual(
      [
        'Select',
        '£',
        'admissions',
        'adults',
        'births',
        'cases',
        'casualties',
        'children',
        'days',
        'deaths',
        'diagnoses',
        'households',
        'incidences',
        'minutes',
        'organisations',
        'people',
        'percentage points',
        'person years',
        'tests',
        'vaccinations',
        'years',
        'Other',
      ],
    );
    expect(optionsOf(input('ratePer') as HTMLSelectElement)).toEqual([
      ['', 'Select'],
      ['1', '1'],
      ['10', '10'],
      ['100', '100'],
      ['1000', '1,000'],
      ['10000', '10,000'],
      ['100000', '100,000'],
      ['1000000', 'million'],
      ['1000000000', 'billion'],
    ]);
    expect(optionsOf(input('rateObject') as HTMLSelectElement).map(([, label]) => label)).toEqual([
      'Select',
      'bed-days',
      'capita',
      'days',
      'expected deaths',
      'expected incidences',
      'people',
      'person years',
      'smokers aged 16+',
      'smokers aged 18+',
      're-offender',
      'STAR-PU',
      'vehicle miles',
      'Other',
    ]);
    expect(optionsOf(input('gapObject') as HTMLSelectElement).map(([, label]) => label)).toEqual([
      'Select',
      'employment rates',
      'life expectancies',
      'Other',
    ]);
  });

  describe('with JavaScript', () => {
    it('asks nothing more until a value type is chosen', () => {
      renderPage();

      expect(shown(standardPopulationQuestion())).toBe(false);
      expect(shown(input('referencePopulation'))).toBe(false);
      expect(askedFollowUps()).toEqual([]);
      expect(preview()).toBeNull();
    });

    it.each([
      [VALUE_TYPE_IDS.count, ['countMeasure']],
      [VALUE_TYPE_IDS.crudeRate, ['hasCount', 'ratePer', 'rateObject']],
      [VALUE_TYPE_IDS.indirectlyStandardisedRatio, ['hasCount']],
      [VALUE_TYPE_IDS.proportion, ['hasCount']],
      [VALUE_TYPE_IDS.ratio, ['hasCount', 'ratioFormat']],
      [VALUE_TYPE_IDS.mean, ['valueMeasure']],
      [VALUE_TYPE_IDS.gap, ['valueMeasure', 'gapObject']],
      [VALUE_TYPE_IDS.lifeExpectancy, []],
      [VALUE_TYPE_IDS.score, []],
    ])('asks of value type %s only its own questions', (id, followUps) => {
      renderPage();

      choose('valueTypeId', id);

      expect(askedFollowUps()).toEqual(followUps);
    });

    it('asks what a count measures, and whether it is an estimate, once there is one', () => {
      renderPage();
      choose('valueTypeId', VALUE_TYPE_IDS.crudeRate);

      answer('hasCount', 'yes');

      expect(askedFollowUps()).toEqual(['hasCount', 'countMeasure', 'ratePer', 'rateObject']);
      expect(shown(screen.getByLabelText('Count is an estimate'))).toBe(true);

      answer('hasCount', 'no');

      expect(askedFollowUps()).toEqual(['hasCount', 'ratePer', 'rateObject']);
    });

    it('asks a counted proportion whether its value measures the same thing, and if not, what', () => {
      renderPage();
      choose('valueTypeId', VALUE_TYPE_IDS.proportion);
      answer('hasCount', 'yes');

      expect(askedFollowUps()).toEqual(['hasCount', 'countMeasure', 'valueSameAsCount']);

      answer('valueSameAsCount', 'no');

      expect(askedFollowUps()).toEqual([
        'hasCount',
        'countMeasure',
        'valueSameAsCount',
        'valueMeasure',
      ]);
    });

    it('asks a proportion with no count what its value measures', () => {
      renderPage();
      choose('valueTypeId', VALUE_TYPE_IDS.proportion);

      answer('hasCount', 'no');

      expect(askedFollowUps()).toEqual(['hasCount', 'valueMeasure']);
    });

    it('keeps the count answers when a change of value type moves them out of the count question', () => {
      renderPage();
      choose('valueTypeId', VALUE_TYPE_IDS.crudeRate);
      answer('hasCount', 'yes');
      choose('countMeasure', 'admissions');
      fireEvent.click(screen.getByLabelText('Count is an estimate'));

      choose('valueTypeId', VALUE_TYPE_IDS.count);

      expect(input('countMeasure').value).toBe('admissions');
      expect((screen.getByLabelText('Count is an estimate') as HTMLInputElement).checked).toBe(
        true,
      );
      expect(preview()).toEqual([
        ['Counts', '-'],
        ['Values', '[number] admissions'],
      ]);
    });

    it('asks for the words under Other', () => {
      renderPage();
      choose('valueTypeId', VALUE_TYPE_IDS.count);

      expect(shown(input('countMeasureDetail'))).toBe(false);

      choose('countMeasure', 'other');

      expect(shown(input('countMeasureDetail'))).toBe(true);
      expect(description(input('countMeasureDetail'))).toBe(
        'Use lowercase letters, except for proper nouns',
      );
    });

    it('asks a directly standardised rate for its standard population', () => {
      renderPage();

      choose('valueTypeId', VALUE_TYPE_IDS.directlyStandardisedRate);

      expect(shown(standardPopulationQuestion())).toBe(true);
      expect(
        within(standardPopulationQuestion())
          .getAllByRole('radio', { hidden: true })
          .map((each) => each.getAttribute('value')),
      ).toEqual(['esp-2013', 'other']);
      expect(shown(input('referencePopulation'))).toBe(false);
    });

    it.each([
      VALUE_TYPE_IDS.indirectlyStandardisedProportion,
      VALUE_TYPE_IDS.indirectlyStandardisedRate,
      VALUE_TYPE_IDS.indirectlyStandardisedRatio,
    ])('asks value type %s for its reference population alone', (id) => {
      renderPage();

      choose('valueTypeId', id);

      expect(shown(input('referencePopulation'))).toBe(true);
      expect(shown(standardPopulationQuestion())).toBe(false);
    });

    it('previews the counts and values once every question asked is answered', () => {
      renderPage();
      choose('valueTypeId', VALUE_TYPE_IDS.crudeRate);
      answer('hasCount', 'yes');
      choose('countMeasure', 'admissions');
      choose('ratePer', '100000');

      expect(preview()).toBeNull();

      choose('rateObject', 'people');

      expect(preview()).toEqual([
        ['Counts', '[number] admissions'],
        ['Values', '[number] admissions per 100,000 people'],
      ]);
    });

    it('previews no counts for a value type whose value is its count', () => {
      renderPage();
      choose('valueTypeId', VALUE_TYPE_IDS.count);
      choose('countMeasure', 'pounds');

      expect(preview()).toEqual([
        ['Counts', '-'],
        ['Values', '£[number]'],
      ]);
    });

    it('follows answers given before the page was hydrated', () => {
      const container = document.createElement('div');
      container.innerHTML = renderToString(page({}));
      document.body.append(container);
      const valueType = container.querySelector<HTMLSelectElement>('#valueTypeId-input');
      if (valueType === null) throw new Error('no value type');
      valueType.value = VALUE_TYPE_IDS.indirectlyStandardisedRatio;

      render(page({}), { container, hydrate: true });

      expect(shown(input('referencePopulation'))).toBe(true);
      expect(askedFollowUps()).toEqual(['hasCount']);
    });

    it('drops the hints that name what each follow-up is for', () => {
      renderPage();

      expect(screen.queryByText(/Only needed/)).toBeNull();
    });
  });

  describe('without JavaScript', () => {
    it('shows every follow-up, hinting at what each is for', () => {
      renderWithoutJavaScript();

      expect(shown(standardPopulationQuestion())).toBe(true);
      expect(shown(input('referencePopulation'))).toBe(true);
      expect(askedFollowUps()).toEqual(FOLLOW_UPS);
      expect(description(input('countMeasure'))).toBe(
        'Only needed for Count, or if there is a count',
      );
      expect(description(input('ratePer'))).toBe(
        'Only needed for Crude rate, Directly standardised rate or Indirectly standardised rate',
      );
      expect(description(input('gapObject'))).toBe('Only needed for Gap');
      expect(description(input('rateObjectDetail'))).toBe(
        'Only needed for Other. Use lowercase letters, except for proper nouns',
      );
      expect(
        screen.getByText(
          'Only needed for Crude rate, Directly standardised rate, Indirectly standardised proportion, Indirectly standardised rate, Indirectly standardised ratio, Proportion or Ratio',
        ),
      ).toBeTruthy();
      expect(
        screen.getByText(
          'Only needed for Indirectly standardised proportion or Proportion, if there is a count',
        ),
      ).toBeTruthy();
    });

    it('tells the two population boxes apart by their hints', () => {
      renderWithoutJavaScript();

      expect(screen.getAllByLabelText(ENTER_POPULATION).map(description)).toEqual([
        'Only needed for Other standard populations',
        'Only needed for Indirectly standardised proportion, Indirectly standardised rate or Indirectly standardised ratio',
      ]);
    });

    it('previews the counts and values of complete answers', () => {
      renderWithoutJavaScript({
        values: {
          ...empty,
          valueTypeId: VALUE_TYPE_IDS.proportion,
          hasCount: 'yes',
          countMeasure: 'people',
          valueSameAsCount: 'yes',
        },
      });

      expect(preview()).toEqual([
        ['Counts', '[number] people'],
        ['Values', '[number]% of people'],
      ]);
    });
  });

  it('shows the answers it is given, so a draft can be revisited', () => {
    renderPage({
      values: {
        ...empty,
        valueTypeId: VALUE_TYPE_IDS.directlyStandardisedRate,
        standardPopulation: 'other',
        standardPopulationOther: 'England 2021',
        hasCount: 'yes',
        countMeasure: 'other',
        countMeasureDetail: 'beds',
        countIsEstimate: 'yes',
        ratePer: '1000',
        rateObject: 'people',
      },
    });

    expect(input('valueTypeId').value).toBe(VALUE_TYPE_IDS.directlyStandardisedRate);
    expect(radio('standardPopulation', 'other').checked).toBe(true);
    expect(input('standardPopulationOther').value).toBe('England 2021');
    expect(radio('hasCount', 'yes').checked).toBe(true);
    expect(input('countMeasure').value).toBe('other');
    expect(input('countMeasureDetail').value).toBe('beds');
    expect((screen.getByLabelText('Count is an estimate') as HTMLInputElement).checked).toBe(true);
    expect(input('ratePer').value).toBe('1000');
    expect(input('rateObject').value).toBe('people');
    expect(preview()).toEqual([
      ['Counts', '[number] beds'],
      ['Values', '[number] beds per 1,000 people'],
    ]);
    expect(document.title).toBe(`${TITLE} - ${serviceName} - GOV.UK`);
  });

  it('links each refusal to its field, in the order the form asks', () => {
    renderPage({
      values: { ...empty, valueTypeId: VALUE_TYPE_IDS.directlyStandardisedRate },
      fieldErrors: {
        rateObject: 'Select what object the rate or proportion is per',
        hasCount: 'Select whether there is a count',
        standardPopulation: 'Select the standard population used',
      },
    });

    const links = within(screen.getByRole('alert')).getAllByRole('link');

    expect(links.map((link) => link.textContent)).toEqual([
      'Select the standard population used',
      'Select whether there is a count',
      'Select what object the rate or proportion is per',
    ]);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      `#${radio('standardPopulation', 'esp-2013').id}`,
      `#${radio('hasCount', 'yes').id}`,
      `#${input('rateObject').id}`,
    ]);
  });

  it('marks a refused reference population and links to it', () => {
    const { container } = renderPage({
      values: { ...empty, valueTypeId: VALUE_TYPE_IDS.indirectlyStandardisedRatio },
      fieldErrors: { referencePopulation: ENTER_POPULATION },
    });

    const error = container.querySelector('.govuk-error-message');
    const link = within(screen.getByRole('alert')).getByRole('link');

    expect(shown(input('referencePopulation'))).toBe(true);
    expect(input('referencePopulation').className).toContain('govuk-input--error');
    expect(input('referencePopulation').getAttribute('aria-describedby')).toBe(error?.id);
    expect(link.getAttribute('href')).toBe(`#${input('referencePopulation').id}`);
  });

  it('sizes the words under Other for 20 characters', () => {
    renderPage();

    expect(input('countMeasureDetail').className).toContain('govuk-input--width-20');
  });
});
