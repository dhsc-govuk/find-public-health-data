// @vitest-environment jsdom
import { serviceName } from '@fphd/ui';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { noRefusal, RELATED_GUIDANCE_LINK } from '../testing.ts';
import { OtherNotesAndCaveatsPage } from './page.tsx';

afterEach(cleanup);

const empty = {
  hasRounding: '',
  roundingDetail: '',
  hasCaveats: '',
  caveatsDetail: '',
  hasOtherNotes: '',
  otherNotesDetail: '',
};

const QUESTIONS = [
  ['Has any rounding been applied?', 'hasRounding', 'roundingDetail'],
  ['Are there any caveats needed?', 'hasCaveats', 'caveatsDetail'],
  ['Are there any other notes needed?', 'hasOtherNotes', 'otherNotesDetail'],
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
      screen.getByRole('heading', { level: 1, name: 'Provide any other notes and caveats' }),
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

  it('asks nothing about disclosure control, which the indicator format and sources page asks', () => {
    renderPage();

    expect(screen.queryByText(/disclosure control/i)).toBeNull();
  });

  it.each(QUESTIONS)(
    'asks for the details of "%s" inside the reveal Yes controls',
    (legend, _, detail) => {
      renderPage();

      expect(detailsField(legend).getAttribute('name')).toBe(detail);
      expect(detailsField(legend).getAttribute('rows')).toBe('2');
      expect(option(legend, 'Yes').getAttribute('aria-controls')).toBe(conditional(legend).id);
    },
  );

  it('shows the answers it is given, so a draft can be revisited', () => {
    renderPage({
      values: {
        ...empty,
        hasRounding: 'no',
        hasCaveats: 'yes',
        caveatsDetail: 'Survey data.',
        hasOtherNotes: 'no',
      },
    });

    expect(option('Has any rounding been applied?', 'No').checked).toBe(true);
    expect(option('Are there any caveats needed?', 'Yes').checked).toBe(true);
    expect(detailsField('Are there any caveats needed?').value).toBe('Survey data.');
    expect(option('Are there any other notes needed?', 'No').checked).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.title).toBe(`Provide any other notes and caveats - ${serviceName} - GOV.UK`);
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
        hasOtherNotes: 'Select whether there are any other notes needed',
        caveatsDetail: 'Provide details of the caveats',
        hasRounding: 'Select whether rounding has been applied',
      },
      values: { ...empty, hasCaveats: 'yes' },
    });

    const links = within(screen.getByRole('alert')).getAllByRole('link');

    expect(links.map((link) => link.textContent)).toEqual([
      'Select whether rounding has been applied',
      'Provide details of the caveats',
      'Select whether there are any other notes needed',
    ]);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      `#${option('Has any rounding been applied?', 'Yes').id}`,
      `#${detailsField('Are there any caveats needed?').id}`,
      `#${option('Are there any other notes needed?', 'Yes').id}`,
    ]);
  });
});
