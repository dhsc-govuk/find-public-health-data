// @vitest-environment jsdom
import { serviceName } from '@fphd/ui';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { noRefusal, RELATED_GUIDANCE_LINK } from '../testing.ts';
import { OtherNotesAndCaveatsPage } from './page.tsx';

afterEach(cleanup);

const empty = {
  hasDataQualityIssues: '',
  hasCaveats: '',
  caveatsDetail: '',
  hasOtherNotes: '',
  otherNotesDetail: '',
};

const DATA_QUALITY = 'Are there any data quality issues with this indicator?';
const CAVEATS = 'Are there any caveats needed?';
const NOTES = 'Are there any additional interpretation notes needed?';
const CAVEATS_PROMPT = 'You need to clearly explain the data quality issues with this indicator.';

const QUESTIONS = [
  [DATA_QUALITY, 'hasDataQualityIssues'],
  [CAVEATS, 'hasCaveats'],
  [NOTES, 'hasOtherNotes'],
] as const;

const DETAILED_QUESTIONS = [
  [CAVEATS, 'caveatsDetail'],
  [NOTES, 'otherNotesDetail'],
] as const;

// The error summary's links read router state, so the page renders inside a router.
function renderPage(props: Partial<Parameters<typeof OtherNotesAndCaveatsPage>[0]> = {}) {
  return render(
    <MemoryRouter>
      <OtherNotesAndCaveatsPage {...noRefusal} values={empty} {...props} />
    </MemoryRouter>,
  );
}

function question(legend: string) {
  return within(screen.getByRole('group', { name: new RegExp(legend.replace('?', '\\?')) }));
}

function option(legend: string, label: string) {
  return question(legend).getByLabelText(label) as HTMLInputElement;
}

function detailsField(legend: string) {
  return question(legend).getByLabelText('Provide details') as HTMLTextAreaElement;
}

/** The block a question's Yes reveals, which holds its details field. */
function conditional(legend: string) {
  const reveal = detailsField(legend).closest('.govuk-radios__conditional');
  if (reveal === null) throw new Error('the details field is not in a conditional reveal');
  return reveal;
}

describe('OtherNotesAndCaveatsPage', () => {
  it('links to its part of the publisher guidance', () => {
    renderPage();

    expect(screen.getByRole('link', { name: RELATED_GUIDANCE_LINK }).getAttribute('href')).toBe(
      '/publish/guidance#caveats',
    );
  });

  it('asks the three questions under the page heading, each a medium heading in its legend', () => {
    const { container } = renderPage();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Quality, caveats and interpretation' }),
    ).toBeTruthy();
    expect(
      screen
        .getAllByRole('heading', { level: 2 })
        .map((heading) => [
          heading.textContent,
          heading.parentElement?.tagName,
          heading.parentElement?.className.includes('govuk-fieldset__legend--m'),
        ]),
    ).toEqual(QUESTIONS.map(([legend]) => [legend, 'LEGEND', true]));
    expect(container.querySelectorAll('h1, h2, h3, h4, h5, h6')).toHaveLength(4);
  });

  it.each(QUESTIONS)('answers "%s" with %s', (legend, name) => {
    renderPage();

    const radios = question(legend).getAllByRole('radio') as HTMLInputElement[];

    expect(radios.every((radio) => radio.name === name)).toBe(true);
    expect(radios.map((radio) => radio.value)).toEqual(['yes', 'no']);
  });

  it('asks that data quality issues are explained in the caveats', () => {
    renderPage();

    expect(
      question(DATA_QUALITY).getByText(
        "If yes, you should ensure these issues are clearly explained in the 'Caveats' section.",
      ),
    ).toBeTruthy();
    expect(question(DATA_QUALITY).queryByLabelText('Provide details')).toBeNull();
  });

  it('asks nothing about rounding or disclosure control', () => {
    renderPage();

    expect(screen.queryByText(/rounding|disclosure control/i)).toBeNull();
  });

  it.each(DETAILED_QUESTIONS)(
    'asks for the details of "%s" inside the reveal Yes controls',
    (legend, detail) => {
      renderPage();

      expect(detailsField(legend).getAttribute('name')).toBe(detail);
      expect(detailsField(legend).getAttribute('rows')).toBe('5');
      expect(option(legend, 'Yes').getAttribute('aria-controls')).toBe(conditional(legend).id);
    },
  );

  it.each(['', 'no'])('shows no caveats prompt while the data quality answer is "%s"', (answer) => {
    renderPage({ values: { ...empty, hasDataQualityIssues: answer } });

    expect(screen.queryByText(CAVEATS_PROMPT)).toBeNull();
  });

  it('prompts for caveats under their question when there are data quality issues', () => {
    renderPage({ values: { ...empty, hasDataQualityIssues: 'yes' } });

    expect(question(CAVEATS).getByText(CAVEATS_PROMPT)).toBeTruthy();
    expect(
      screen.getAllByRole('radio').filter((radio) => (radio as HTMLInputElement).checked),
    ).toHaveLength(1);
  });

  it('shows the answers it is given, so a draft can be revisited', () => {
    renderPage({
      values: {
        ...empty,
        hasDataQualityIssues: 'no',
        hasCaveats: 'yes',
        caveatsDetail: 'Survey data.',
        hasOtherNotes: 'no',
      },
    });

    expect(option(DATA_QUALITY, 'No').checked).toBe(true);
    expect(option(CAVEATS, 'Yes').checked).toBe(true);
    expect(detailsField(CAVEATS).value).toBe('Survey data.');
    expect(option(NOTES, 'No').checked).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.title).toBe(`Quality, caveats and interpretation - ${serviceName} - GOV.UK`);
  });

  it('chooses nothing while the questions are unanswered', () => {
    renderPage();

    expect(screen.getAllByRole('radio').some((radio) => (radio as HTMLInputElement).checked)).toBe(
      false,
    );
  });

  it('links each refusal to its control, in the order the form asks', () => {
    renderPage({
      fieldErrors: {
        hasOtherNotes: 'Select whether there are any additional interpretation notes needed',
        caveatsDetail: 'Provide details of the caveats',
        hasDataQualityIssues:
          'Select whether there are any data quality issues with this indicator',
      },
      values: { ...empty, hasCaveats: 'yes' },
    });

    const links = within(screen.getByRole('alert')).getAllByRole('link');

    expect(links.map((link) => link.textContent)).toEqual([
      'Select whether there are any data quality issues with this indicator',
      'Provide details of the caveats',
      'Select whether there are any additional interpretation notes needed',
    ]);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      `#${option(DATA_QUALITY, 'Yes').id}`,
      `#${detailsField(CAVEATS).id}`,
      `#${option(NOTES, 'Yes').id}`,
    ]);
  });

  it('links the refusal of No to caveats beside data quality issues to the caveats question', () => {
    const refusal =
      "If there are data quality issues, you need to explain these in the 'Caveats' section";
    renderPage({
      fieldErrors: { hasCaveats: refusal },
      values: { ...empty, hasDataQualityIssues: 'yes', hasCaveats: 'no' },
    });

    const link = within(screen.getByRole('alert')).getByRole('link', { name: refusal });

    expect(link.getAttribute('href')).toBe(`#${option(CAVEATS, 'Yes').id}`);
    expect(question(CAVEATS).getAllByText(refusal, { exact: false })).not.toHaveLength(0);
  });
});
