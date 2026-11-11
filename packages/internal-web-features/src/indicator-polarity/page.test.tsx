// @vitest-environment jsdom
import { serviceName } from '@fphd/ui';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { noRefusal } from '../testing.ts';
import { PolarityPage } from './page.tsx';

afterEach(cleanup);

const QUESTION = 'What is the polarity of this indicator?';

// The error summary's links read router state, so the page renders inside a router.
function renderPage(props: Partial<Parameters<typeof PolarityPage>[0]> = {}) {
  return render(
    <MemoryRouter>
      <PolarityPage {...noRefusal} values={{ polarity: '' }} {...props} />
    </MemoryRouter>,
  );
}

function option(label: string) {
  return screen.getByLabelText(label) as HTMLInputElement;
}

describe('PolarityPage', () => {
  it('asks the question as the page heading, which also names the group of options', () => {
    renderPage();

    const heading = screen.getByRole('heading', { level: 1, name: QUESTION });

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(heading.closest('legend')).not.toBeNull();
    expect(screen.getByRole('group', { name: QUESTION })).toBeTruthy();
    expect(document.title).toBe(`${QUESTION} - ${serviceName} - GOV.UK`);
  });

  it('offers the four polarities in a fixed order', () => {
    renderPage();

    const radios = within(screen.getByRole('group')).getAllByRole('radio') as HTMLInputElement[];

    expect(radios.map((radio) => radio.labels?.[0]?.textContent)).toEqual([
      'Higher is better',
      'Lower is better',
      'Neither is better',
      'No comparison should be made',
    ]);
    expect(radios.map((radio) => radio.value)).toEqual([
      'higher-is-better',
      'lower-is-better',
      'no-polarity',
      'no-comparison-possible',
    ]);
    expect(radios.every((radio) => radio.name === 'polarity' && !radio.checked)).toBe(true);
  });

  it('shows the polarity it is given, so a draft can be revisited', () => {
    renderPage({ values: { polarity: 'no-polarity' } });

    expect(option('Neither is better').checked).toBe(true);
    expect(option('Higher is better').checked).toBe(false);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('links the refusal to the first option and describes the options with it', () => {
    const { container } = renderPage({
      fieldErrors: { polarity: 'Select the polarity of the indicator' },
    });

    const link = within(screen.getByRole('alert')).getByRole('link');
    const error = container.querySelector('.govuk-error-message');

    expect(link.textContent).toBe('Select the polarity of the indicator');
    expect(link.getAttribute('href')).toBe(`#${option('Higher is better').id}`);
    expect(screen.getByRole('group').getAttribute('aria-describedby')).toBe(error?.id);
    expect(container.querySelectorAll('.govuk-form-group--error')).toHaveLength(1);
  });
});
