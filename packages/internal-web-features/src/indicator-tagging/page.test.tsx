// @vitest-environment jsdom
import type { TagOptions } from '@fphd/internal-api-features/contract';
import { serviceName } from '@fphd/ui';
import { CLASSIFICATION_IDS } from '@fphd/utils/classification-dimension';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { addIntent, removeIntent } from '../list-form.ts';
import { noRefusal } from '../testing.ts';
import type { TaggingPageValues } from './form.ts';
import { TaggingPage } from './page.tsx';

afterEach(cleanup);

const TITLE = 'Add tags for this indicator';

const dental = '019fa38f-073f-764e-9ac6-1c4d03b10001';
const cancer = '019fa38f-073f-764e-9ac6-1c4d03b10002';
const outcome = '019fa38f-073f-764e-9ac6-1c4d03b10003';
const children = '019fa38f-073f-764e-9ac6-1c4d03b10004';
const lof = '019fa38f-073f-764e-9ac6-1c4d03b10005';
const alcohol = '019fa38f-073f-764e-9ac6-1c4d03b10006';
const allCancers = '019fa38f-073f-764e-9ac6-1c4d03b10007';
const bowelCancer = '019fa38f-073f-764e-9ac6-1c4d03b10008';
const phof = CLASSIFICATION_IDS.publicHealthOutcomesFramework;

const options: TagOptions = {
  topics: [
    { id: cancer, name: 'Cancer' },
    { id: dental, name: 'Dental and oral health' },
  ],
  subtopics: [
    { id: allCancers, name: 'All cancers', topicId: cancer },
    { id: bowelCancer, name: 'Bowel cancer', topicId: cancer },
  ],
  indicatorTypes: [{ id: outcome, name: 'Outcome' }],
  frameworks: [
    { id: lof, name: 'Local Outcomes Framework (LOF): Health and wellbeing domain' },
    { id: phof, name: 'Public Health Outcomes Framework (PHOF)' },
  ],
  lifeStages: [{ id: children, name: 'Children (0 to 15 years old)' }],
  riskFactors: [{ id: alcohol, name: 'Alcohol' }],
};

const empty: TaggingPageValues = {
  topicIds: [],
  subtopicIds: [],
  indicatorTypeIds: [],
  hasFramework: '',
  frameworkIds: [],
  phofIndicatorNumber: '',
  hasLifeStage: '',
  lifeStageIds: [],
  hasRiskFactor: '',
  riskFactorIds: [],
  addTopic: '',
  addSubtopic: '',
  addFramework: '',
  addLifeStage: '',
  addRiskFactor: '',
};

// The error summary's links read router state, so the page renders inside a router.
function renderPage(props: Partial<Parameters<typeof TaggingPage>[0]> = {}) {
  return render(
    <MemoryRouter>
      <TaggingPage {...noRefusal} options={options} values={empty} {...props} />
    </MemoryRouter>,
  );
}

function select(label: string) {
  return screen.getByLabelText(label, { exact: true }) as HTMLSelectElement;
}

function hidden(name: string) {
  return [...document.querySelectorAll<HTMLInputElement>(`input[type="hidden"][name="${name}"]`)];
}

function removeButton(name: string) {
  return screen.getByRole('button', { name }) as HTMLButtonElement;
}

/** Each Add button's words and value, in page order. */
function addButtons() {
  return screen
    .getAllByRole('button', { name: /^Add / })
    .map((button) => [button.textContent, (button as HTMLButtonElement).value]);
}

describe('TaggingPage', () => {
  it('heads the page, says tags may be many, and asks the questions in order', () => {
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: TITLE })).toBeTruthy();
    expect(document.title).toBe(`${TITLE} - ${serviceName} - GOV.UK`);
    expect(
      screen.getByText('You can select as many tags as are relevant to this indicator.'),
    ).toBeTruthy();
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent),
    ).toEqual([
      'Select a topic',
      'Select a measure type',
      'Is this indicator part of a framework or programme?',
      'Do you need to include the life stage the indicator relates to?',
      'Does this indicator include a risk factor?',
    ]);
  });

  it('asks each question under Yes as a level 3 heading', () => {
    renderPage();

    expect(
      screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent),
    ).toEqual(['Select a framework or programme', 'Select a life stage', 'Select a risk factor']);
  });

  it('asks neither for an area context answer nor for a primary topic', () => {
    renderPage();

    expect(document.querySelector('[name="isAreaContext"]')).toBeNull();
    expect(document.querySelector('[name="primaryTopicId"]')).toBeNull();
    expect(screen.queryByText(/age metadata/)).toBeNull();
  });

  it('offers every tag of each list in a plain select, the lists built up with Add buttons', () => {
    renderPage();

    expect([...select('Select a topic').options].map((option) => option.text)).toEqual([
      'Select',
      'Cancer',
      'Dental and oral health',
    ]);
    expect(select('Select a framework or programme').name).toBe('addFramework');
    expect(select('Select a life stage').name).toBe('addLifeStage');
    expect(select('Select a risk factor').name).toBe('addRiskFactor');
    expect(document.querySelector('.fphd-autocomplete')).toBeNull();
    expect(addButtons()).toEqual([
      ['Add topic', addIntent('topicIds')],
      ['Add framework or programme', addIntent('frameworkIds')],
      ['Add life stage', addIntent('lifeStageIds')],
      ['Add risk factor', addIntent('riskFactorIds')],
    ]);
  });

  it('shows the Add buttons as primary buttons and the Remove buttons as secondary', () => {
    renderPage({ values: { ...empty, topicIds: [dental], addTopic: cancer } });

    for (const name of ['Add topic and subtopic', 'Add framework or programme']) {
      expect(screen.getByRole('button', { name }).className).not.toContain('secondary');
    }
    expect(removeButton('Remove topic Dental and oral health').className).toContain(
      'govuk-button--secondary',
    );
  });

  it('asks for one measure type in a select of its own, with no Add or Remove button', () => {
    renderPage({ values: { ...empty, indicatorTypeIds: [outcome] } });

    expect(select('Select a measure type').name).toBe('indicatorTypeIds');
    expect(select('Select a measure type').value).toBe(outcome);
    expect([...select('Select a measure type').options].map((option) => option.text)).toEqual([
      'Select',
      'Outcome',
    ]);
    expect(hidden('indicatorTypeIds')).toEqual([]);
    expect(screen.queryByRole('button', { name: /measure type/ })).toBeNull();
  });

  it('asks for a subtopic of a chosen topic that has them, with one button to add both', () => {
    renderPage({ values: { ...empty, addTopic: cancer, addSubtopic: bowelCancer } });

    expect(select('Select a topic').value).toBe(cancer);
    expect(
      [...select('Select a subtopic for Cancer').options].map((option) => option.text),
    ).toEqual(['Select', 'All cancers', 'Bowel cancer']);
    expect(select('Select a subtopic for Cancer').value).toBe(bowelCancer);
    expect(addButtons()[0]).toEqual(['Add topic and subtopic', addIntent('subtopicIds')]);
    expect(screen.queryByRole('button', { name: 'Add topic' })).toBeNull();
  });

  it('asks for no subtopic of a chosen topic that has none', () => {
    renderPage({ values: { ...empty, addTopic: dental } });

    expect(screen.queryByLabelText(/Select a subtopic/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Add topic' })).toBeTruthy();
  });

  it('asks for a subtopic as soon as a topic that has them is chosen', () => {
    renderPage();

    fireEvent.change(select('Select a topic'), { target: { value: cancer } });

    expect(select('Select a subtopic for Cancer').value).toBe('');
    expect(screen.getByRole('button', { name: 'Add topic and subtopic' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add topic' })).toBeNull();

    fireEvent.change(select('Select a topic'), { target: { value: dental } });

    expect(screen.queryByLabelText(/Select a subtopic/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add topic and subtopic' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Add topic' })).toBeTruthy();
  });

  it('drops the subtopic refusal once another topic is chosen', () => {
    const other = '019fa38f-073f-764e-9ac6-1c4d03b10009';
    const complications = '019fa38f-073f-764e-9ac6-1c4d03b10010';
    renderPage({
      options: {
        ...options,
        topics: [...options.topics, { id: other, name: 'Diabetes' }],
        subtopics: [
          ...options.subtopics,
          { id: complications, name: 'Complications', topicId: other },
        ],
      },
      values: { ...empty, addTopic: cancer },
      fieldErrors: { addSubtopic: 'Select a subtopic for Cancer' },
    });
    expect(select('Select a subtopic for Cancer').getAttribute('aria-describedby')).toBe(
      'addSubtopic-error',
    );

    fireEvent.change(select('Select a topic'), { target: { value: other } });

    expect(select('Select a subtopic for Diabetes').getAttribute('aria-describedby')).toBeNull();
    expect(document.getElementById('addSubtopic-error')).toBeNull();
  });

  it('lists each topic added with its subtopics, carried in the form with Remove buttons', () => {
    renderPage({
      values: { ...empty, topicIds: [dental, cancer], subtopicIds: [bowelCancer, allCancers] },
    });

    expect(hidden('topicIds').map((input) => input.value)).toEqual([dental, cancer]);
    expect(hidden('subtopicIds').map((input) => input.value)).toEqual([bowelCancer, allCancers]);
    expect(
      [...document.querySelectorAll('.fphd-added-list__item > span')].map(
        (item) => item.textContent,
      ),
    ).toEqual(['Dental and oral health', 'Cancer: Bowel cancer', 'Cancer: All cancers']);
    expect(removeButton('Remove topic Dental and oral health').value).toBe(
      removeIntent(0, 'topicIds'),
    );
    expect(removeButton('Remove topic Cancer: All cancers').value).toBe(
      removeIntent(1, 'subtopicIds'),
    );
  });

  it('leaves out a tag the page no longer offers', () => {
    const gone = '019fa38f-073f-764e-9ac6-1c4d03b10999';
    renderPage({
      values: { ...empty, topicIds: [gone, dental], riskFactorIds: [gone, alcohol] },
    });

    expect(hidden('topicIds').map((input) => input.value)).toEqual([dental]);
    expect(removeButton('Remove topic Dental and oral health').value).toBe(
      removeIntent(0, 'topicIds'),
    );
    expect(hidden('riskFactorIds').map((input) => input.value)).toEqual([alcohol]);
    expect(removeButton('Remove risk factor Alcohol').value).toBe(removeIntent(0, 'riskFactorIds'));
  });

  it('asks for the PHOF indicator number once the Public Health Outcomes Framework is added', () => {
    renderPage({
      values: { ...empty, hasFramework: 'yes', frameworkIds: [phof], phofIndicatorNumber: '2.12' },
    });

    expect(screen.getByRole('textbox', { name: 'Enter PHOF indicator number' })).toHaveProperty(
      'value',
      '2.12',
    );
  });

  it('asks for no PHOF indicator number beside another framework', () => {
    renderPage({ values: { ...empty, hasFramework: 'yes', frameworkIds: [lof] } });

    expect(screen.queryByRole('textbox', { name: 'Enter PHOF indicator number' })).toBeNull();
  });

  it('shows a refused list on the select that adds to it, linked from the summary', () => {
    renderPage({
      fieldErrors: {
        subtopicIds: 'Select a subtopic for Cancer',
        hasRiskFactor: 'Select whether this indicator includes a risk factor',
      },
    });

    const summary = screen.getByRole('alert');
    expect(
      within(summary)
        .getAllByRole('link')
        .map((link) => [link.textContent, link.getAttribute('href')]),
    ).toEqual([
      ['Select a subtopic for Cancer', '#addTopic-input'],
      ['Select whether this indicator includes a risk factor', '#hasRiskFactor-radio-0'],
    ]);
    expect(select('Select a topic').getAttribute('aria-describedby')).toBe('addTopic-error');
  });

  it('continues when Enter is pressed rather than pressing the first Add', () => {
    renderPage();

    const [first] = document.querySelectorAll(
      'form button[type="submit"], form button:not([type])',
    );
    expect(first?.textContent).toBe('Continue');
  });
});
