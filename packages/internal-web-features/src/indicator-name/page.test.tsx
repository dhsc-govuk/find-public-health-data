// @vitest-environment jsdom
import { serviceName } from '@fphd/ui';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { SHOWN_VERSION } from '../testing.ts';
import { IndicatorNamePage } from './page.tsx';

afterEach(cleanup);

// The error summary's links read router state, so the page renders inside a router.
function renderPage(props: Parameters<typeof IndicatorNamePage>[0] = {}) {
  return render(
    <MemoryRouter initialEntries={['/publish/indicators/new']}>
      <IndicatorNamePage {...props} />
    </MemoryRouter>,
  );
}

function nameField() {
  return screen.getByLabelText('What is the name of the indicator?') as HTMLInputElement;
}

describe('IndicatorNamePage', () => {
  it('asks the question as the heading and as the label of the field', () => {
    renderPage();

    expect(
      screen.getByRole('heading', { level: 1, name: 'What is the name of the indicator?' }),
    ).toBeTruthy();
    expect(nameField().getAttribute('name')).toBe('name');
  });

  it('describes the field with the hint', () => {
    renderPage();

    const hint = screen.getByText(
      'The name should be unique, descriptive and written in plain English.',
    );

    expect(nameField().getAttribute('aria-describedby')).toBe(hint.id);
  });

  it('posts back to its own address, so it works without JavaScript', () => {
    const { container } = renderPage();
    const form = container.querySelector('form');

    expect(form?.getAttribute('method')).toBe('post');
    expect(form?.getAttribute('action')).toBeNull();
    expect(screen.getByRole('button', { name: 'Continue' }).getAttribute('type')).toBe('submit');
  });

  it('starts empty and shows no error', () => {
    renderPage();

    expect(nameField().value).toBe('');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('titles the document after the question', () => {
    renderPage();

    expect(document.title).toBe(`What is the name of the indicator? - ${serviceName} - GOV.UK`);
  });

  it('summarises a rejected submission and links to the field', () => {
    renderPage({ fieldErrors: { name: 'Enter the name of the indicator' }, name: '' });

    const link = within(screen.getByRole('alert')).getByRole('link', {
      name: 'Enter the name of the indicator',
    });

    expect(link.getAttribute('href')).toBe(`#${nameField().id}`);
  });

  it('marks the field, describes it with the error and keeps what was typed', () => {
    const { container } = renderPage({
      fieldErrors: { name: 'Enter the name of the indicator' },
      name: 'Kept',
    });

    const field = nameField();
    const error = container.querySelector('.govuk-error-message');

    expect(field.value).toBe('Kept');
    expect(field.className).toContain('govuk-input--error');
    expect(field.getAttribute('aria-describedby')).toContain(error?.id);
    expect(container.querySelector('.govuk-form-group--error')).toBeTruthy();
  });

  it('shows the name it was given, so a draft can be renamed', () => {
    renderPage({ name: 'Life expectancy at birth' });

    expect(nameField().value).toBe('Life expectancy at birth');
  });

  it('sends back the version of the name a rename was shown', () => {
    const { container } = renderPage({ name: 'Life expectancy at birth', version: SHOWN_VERSION });

    expect(container.querySelector<HTMLInputElement>('input[name="version"]')?.value).toBe(
      SHOWN_VERSION,
    );
  });

  it('sends no version for a new indicator', () => {
    const { container } = renderPage();

    expect(container.querySelector('input[name="version"]')).toBeNull();
  });
});
