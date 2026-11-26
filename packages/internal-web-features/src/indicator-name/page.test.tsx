// @vitest-environment jsdom
import { serviceName } from '@fphd/ui';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { RELATED_GUIDANCE_LINK, SHOWN_VERSION } from '../testing.ts';
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

const QUESTION = 'What is the name of the indicator?';

function nameField() {
  return screen.getByLabelText(QUESTION) as HTMLInputElement;
}

describe('IndicatorNamePage', () => {
  it('asks the question as the heading, and labels the field with it', () => {
    const { container } = renderPage();
    const heading = screen.getByRole('heading', { level: 1, name: QUESTION });

    expect(heading.closest('label')).toBeNull();
    expect(container.querySelector('label .govuk-visually-hidden')?.textContent).toBe(QUESTION);
    expect(nameField().getAttribute('name')).toBe('name');
  });

  it('links to the guidance on names between the heading and the field, and gives no hint', () => {
    const { container } = renderPage();
    const link = screen.getByRole('link', { name: RELATED_GUIDANCE_LINK });

    expect(link.getAttribute('href')).toBe('/publish/guidance#name');
    expect(
      screen.getByRole('heading', { level: 1 }).compareDocumentPosition(link) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      link.compareDocumentPosition(nameField()) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(nameField().getAttribute('aria-describedby')).toBeNull();
    expect(container.querySelector('.govuk-hint')).toBeNull();
  });

  it('posts back to its own address, so it works without JavaScript', () => {
    const { container } = renderPage();
    const form = container.querySelector('form');

    expect(form?.getAttribute('method')).toBe('post');
    expect(form?.getAttribute('action')).toBe('/publish/indicators/new');
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

  it("sends a new indicator's id with the name, kept from the browser's autofill", () => {
    const { container } = renderPage({ newIndicatorId: '019a1b2c-3d4e-7f60-8a9b-0c1d2e3f4a5b' });
    const id = container.querySelector<HTMLInputElement>('form input[name="id"]');

    expect(id?.type).toBe('hidden');
    expect(id?.value).toBe('019a1b2c-3d4e-7f60-8a9b-0c1d2e3f4a5b');
    expect(id?.autocomplete).toBe('off');
  });

  it('sends no id for a draft being renamed', () => {
    const { container } = renderPage({ name: 'Life expectancy at birth', version: SHOWN_VERSION });

    expect(container.querySelector('input[name="id"]')).toBeNull();
  });
});
