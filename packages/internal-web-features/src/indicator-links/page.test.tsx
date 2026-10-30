// @vitest-environment jsdom
import { serviceName } from '@fphd/ui';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { noRefusal, SHOWN_VERSION } from '../testing.ts';
import type { LinksPageValues } from './form.ts';
import { LinksPage } from './page.tsx';

afterEach(cleanup);

const QUESTION = 'Are there any relevant links to help users understand this indicator better?';

const commentary = { url: 'https://www.gov.uk/statistics', text: 'Statistical commentary' };
const fingertips = { url: 'https://fingertips.phe.org.uk/', text: 'Fingertips' };

const empty: LinksPageValues = { hasLinks: '', links: [], linkUrl: '', linkText: '' };
const twoLinks: LinksPageValues = { ...empty, hasLinks: 'yes', links: [commentary, fingertips] };

// The error summary's links read router state, so the page renders inside a router.
function renderPage(props: Partial<Parameters<typeof LinksPage>[0]> = {}) {
  return render(
    <MemoryRouter>
      <LinksPage {...noRefusal} values={empty} {...props} />
    </MemoryRouter>,
  );
}

function urlField() {
  return screen.getByLabelText('Add link URL') as HTMLInputElement;
}

function textField() {
  return screen.getByLabelText('Add link text') as HTMLInputElement;
}

function option(label: 'Yes' | 'No') {
  return screen.getByLabelText(label) as HTMLInputElement;
}

/** The block "Yes" reveals, which holds the fields and the list. */
function conditional() {
  const reveal = urlField().closest('.govuk-radios__conditional');
  if (reveal === null) throw new Error('the URL field is not in a conditional reveal');
  return reveal as HTMLElement;
}

describe('LinksPage', () => {
  it('asks the question as the page heading, which also names the group of options', () => {
    renderPage();

    const heading = screen.getByRole('heading', { level: 1, name: QUESTION });

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(heading.closest('legend')).not.toBeNull();
    expect(screen.getByRole('group', { name: QUESTION })).toBeTruthy();
    expect(document.title).toBe(`${QUESTION} - ${serviceName} - GOV.UK`);
  });

  it('hints at the links it means, described by the group', () => {
    renderPage();

    const hint = screen.getByText(
      'For example, any statistical commentaries that will be available once this indicator is published',
    );

    expect(hint.className).toContain('govuk-hint');
    expect(screen.getByRole('group').getAttribute('aria-describedby')).toContain(hint.id);
  });

  it('offers yes and no, choosing neither while unanswered', () => {
    renderPage();

    const radios = within(screen.getByRole('group')).getAllByRole('radio') as HTMLInputElement[];

    expect(radios.map((radio) => [radio.name, radio.value, radio.checked])).toEqual([
      ['hasLinks', 'yes', false],
      ['hasLinks', 'no', false],
    ]);
  });

  it('asks for a link inside the reveal that "Yes" controls, with a button that adds it', () => {
    renderPage();

    const add = within(conditional()).getByRole('button', { name: 'Add link' });

    expect(option('Yes').getAttribute('aria-controls')).toBe(conditional().id);
    expect(urlField().name).toBe('linkUrl');
    expect(urlField().type).toBe('text');
    expect(urlField().inputMode).toBe('url');
    expect(textField().name).toBe('linkText');
    expect(add.getAttribute('type')).toBe('submit');
    expect(add.getAttribute('name')).toBe('intent');
    expect(add.getAttribute('value')).toBe('add');
    expect(add.className).toContain('govuk-button--secondary');
  });

  it('reveals the link fields when "Yes" is chosen', () => {
    renderPage();

    expect(conditional().className).toContain('govuk-radios__conditional--hidden');

    fireEvent.click(option('Yes'));

    expect(conditional().className).not.toContain('govuk-radios__conditional--hidden');
  });

  it('lists the links added so far, each opening in a new tab', () => {
    renderPage({ values: twoLinks });

    const items = within(conditional()).getAllByRole('listitem');
    const links = items.map((item) => within(item).getByRole('link'));

    expect(links.map((link) => link.textContent)).toEqual([
      'Statistical commentary (opens in new tab)',
      'Fingertips (opens in new tab)',
    ]);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      commentary.url,
      fingertips.url,
    ]);
    expect(links.every((link) => link.getAttribute('target') === '_blank')).toBe(true);
    expect(links.every((link) => link.getAttribute('rel') === 'noreferrer')).toBe(true);
  });

  it('carries each link in hidden fields, in order, so the form sends the list', () => {
    const { container } = renderPage({ values: twoLinks });

    const hidden = [...container.querySelectorAll<HTMLInputElement>('input[type="hidden"]')];

    expect(hidden.map(({ name, value }) => [name, value])).toEqual([
      ['version', SHOWN_VERSION],
      ['links[0].url', commentary.url],
      ['links[0].text', commentary.text],
      ['links[1].url', fingertips.url],
      ['links[1].text', fingertips.text],
    ]);
  });

  it('removes each link with a button named for it', () => {
    renderPage({ values: twoLinks });

    const remove = screen.getByRole('button', { name: 'Remove link Fingertips' });

    expect(remove.getAttribute('type')).toBe('submit');
    expect(remove.getAttribute('name')).toBe('intent');
    expect(remove.getAttribute('value')).toBe('remove-1');
    expect(remove.textContent).toBe('Remove link Fingertips');
    expect(remove.className).toContain('govuk-button--secondary');
    expect(screen.getByRole('button', { name: 'Remove link Statistical commentary' })).toBeTruthy();
  });

  it('lets Enter continue rather than add or remove a link', () => {
    const { container } = renderPage({ values: twoLinks });

    const first = container.querySelector('form button');

    expect(first?.textContent).toBe('Continue');
    expect(first?.getAttribute('name')).toBeNull();
  });

  it('shows no list while there are no links', () => {
    renderPage({ values: { ...empty, hasLinks: 'yes' } });

    expect(screen.queryByRole('list', { hidden: true })).toBeNull();
  });

  it('shows the answers it is given, so a draft can be revisited', () => {
    renderPage({ values: { ...twoLinks, linkUrl: 'https://typed', linkText: 'Typed' } });

    expect(option('Yes').checked).toBe(true);
    expect(conditional().className).not.toContain('govuk-radios__conditional--hidden');
    expect(urlField().value).toBe('https://typed');
    expect(textField().value).toBe('Typed');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('links each refusal to its control, in the order the page asks', () => {
    renderPage({
      values: { ...empty, hasLinks: 'yes' },
      fieldErrors: { linkText: 'Enter link text', linkUrl: 'Enter a URL' },
    });

    const links = within(screen.getByRole('alert')).getAllByRole('link');

    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Enter a URL', `#${urlField().id}`],
      ['Enter link text', `#${textField().id}`],
    ]);
    expect(urlField().className).toContain('govuk-input--error');
    expect(textField().className).toContain('govuk-input--error');
  });

  it('links an unanswered question to the first option', () => {
    renderPage({ fieldErrors: { hasLinks: 'Select whether there are any relevant links' } });

    const link = within(screen.getByRole('alert')).getByRole('link');

    expect(link.getAttribute('href')).toBe(`#${option('Yes').id}`);
    expect(screen.getByRole('group').closest('.govuk-form-group--error')).not.toBeNull();
  });

  it('asks for a link at the URL field when "Yes" has none', () => {
    renderPage({
      values: { ...empty, hasLinks: 'yes' },
      fieldErrors: { links: 'Add at least one link' },
    });

    const link = within(screen.getByRole('alert')).getByRole('link', {
      name: 'Add at least one link',
    });
    const error = conditional().querySelector('.govuk-error-message');

    expect(link.getAttribute('href')).toBe(`#${urlField().id}`);
    expect(error?.textContent).toContain('Add at least one link');
    expect(urlField().getAttribute('aria-describedby')).toBe(error?.id);
  });
});
