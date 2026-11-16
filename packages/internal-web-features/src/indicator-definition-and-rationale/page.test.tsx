// @vitest-environment jsdom
import { serviceName } from '@fphd/ui';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { noRefusal, RELATED_GUIDANCE_LINK } from '../testing.ts';
import { DefinitionAndRationalePage } from './page.tsx';

afterEach(cleanup);

const empty = { definition: '', rationale: '' };

// The error summary's links read router state, so the page renders inside a router.
function renderPage(props: Partial<Parameters<typeof DefinitionAndRationalePage>[0]> = {}) {
  return render(
    <MemoryRouter>
      <DefinitionAndRationalePage {...noRefusal} values={empty} {...props} />
    </MemoryRouter>,
  );
}

function definitionField() {
  return screen.getByLabelText('What is the definition of this indicator?') as HTMLTextAreaElement;
}

function rationaleField() {
  return screen.getByLabelText('What is the rationale for this indicator?') as HTMLTextAreaElement;
}

describe('DefinitionAndRationalePage', () => {
  it('links to its part of the publisher guidance', () => {
    renderPage();

    expect(screen.getByRole('link', { name: RELATED_GUIDANCE_LINK }).getAttribute('href')).toBe(
      '/publish/guidance#definition',
    );
  });

  it('asks for the definition and the rationale under the section heading', () => {
    renderPage();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Definition and rationale' }),
    ).toBeTruthy();
    expect(definitionField().getAttribute('name')).toBe('definition');
    expect(rationaleField().getAttribute('name')).toBe('rationale');
  });

  it('gives the rationale more room than the definition', () => {
    renderPage();

    expect(definitionField().getAttribute('rows')).toBe('8');
    expect(rationaleField().getAttribute('rows')).toBe('15');
  });

  it('shows the answers it is given, so a draft can be revisited', () => {
    renderPage({ values: { definition: 'A definition', rationale: 'A rationale' } });

    expect(definitionField().value).toBe('A definition');
    expect(rationaleField().value).toBe('A rationale');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.title).toBe(`Definition and rationale - ${serviceName} - GOV.UK`);
  });

  it('links each refusal to its field, in the order the form asks', () => {
    renderPage({
      fieldErrors: {
        rationale: 'Enter the rationale for the indicator',
        definition: 'Enter the definition of the indicator',
      },
    });

    const links = within(screen.getByRole('alert')).getAllByRole('link');

    expect(links.map((link) => link.textContent)).toEqual([
      'Enter the definition of the indicator',
      'Enter the rationale for the indicator',
    ]);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      `#${definitionField().id}`,
      `#${rationaleField().id}`,
    ]);
  });

  it('marks only the refused field, describing it with the error and keeping what was typed', () => {
    const { container } = renderPage({
      fieldErrors: { rationale: 'Enter the rationale for the indicator' },
      values: { definition: 'Kept', rationale: '' },
    });

    const error = container.querySelector('.govuk-error-message');

    expect(definitionField().value).toBe('Kept');
    expect(definitionField().className).not.toContain('govuk-textarea--error');
    expect(rationaleField().className).toContain('govuk-textarea--error');
    expect(rationaleField().getAttribute('aria-describedby')).toBe(error?.id);
    expect(container.querySelectorAll('.govuk-form-group--error')).toHaveLength(1);
  });
});
