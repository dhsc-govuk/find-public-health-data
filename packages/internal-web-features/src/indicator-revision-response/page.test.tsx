// @vitest-environment jsdom
import { serviceName } from '@fphd/ui';
import { renderMarkdown } from '@fphd/ui/markdown';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { noRefusal, SHOWN_VERSION } from '../testing.ts';
import { RevisionResponsePage } from './page.tsx';

afterEach(cleanup);

function renderPage(props: Partial<Parameters<typeof RevisionResponsePage>[0]> = {}) {
  return render(
    <MemoryRouter>
      <RevisionResponsePage
        {...noRefusal}
        clarificationRequest={renderMarkdown('Which **years** are counted?')}
        values={{ revisionResponse: '' }}
        version={SHOWN_VERSION}
        {...props}
      />
    </MemoryRouter>,
  );
}

function reply() {
  return screen.getByRole('textbox', {
    name: 'Response to revisions or clarifications',
  }) as HTMLTextAreaElement;
}

describe('RevisionResponsePage', () => {
  it('labels the reply with the page heading, as the prototype does', () => {
    renderPage();

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent).toBe('Response to revisions or clarifications');
    expect(heading.querySelector('label')?.getAttribute('for')).toBe('revisionResponse-input');
    expect(reply().name).toBe('revisionResponse');
    expect(reply().getAttribute('rows')).toBe('8');
    expect(document.title).toBe(
      `Response to revisions or clarifications - ${serviceName} - GOV.UK`,
    );
  });

  it('shows the clarification request as the reviewer wrote it', () => {
    renderPage();

    expect(
      screen.getByRole('heading', { level: 2, name: 'High-level clarification request' }),
    ).toBeTruthy();
    expect(screen.getByText('years').tagName).toBe('STRONG');
  });

  it('shows no clarification request when there is none', () => {
    renderPage({ clarificationRequest: null });

    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
  });

  it('describes the reply with what to summarise', () => {
    renderPage();

    const hint = document.getElementById(reply().getAttribute('aria-describedby') ?? '');
    expect(hint?.textContent).toContain('Summarise:');
    expect([...(hint?.querySelectorAll('li') ?? [])].map((item) => item.textContent)).toEqual([
      'any changes you have made in response to advised revisions',
      'if you have not made any advised revisions and why',
      'any response you have to any clarifications requested',
    ]);
  });

  it('keeps the reply and sends back the version shown', () => {
    renderPage({ values: { revisionResponse: 'Checked the years' } });

    expect(reply().value).toBe('Checked the years');
    expect(
      (document.querySelector('input[name="version"]') as HTMLInputElement | null)?.value,
    ).toBe(SHOWN_VERSION);
  });

  it('shows a refused reply in the error summary and on the field', () => {
    const message = 'Enter your response to the requested revisions and clarification request';
    renderPage({ fieldErrors: { revisionResponse: message } });

    expect(screen.getByRole('link', { name: message }).getAttribute('href')).toBe(
      '#revisionResponse-input',
    );
    expect(reply().className).toContain('govuk-textarea--error');
    expect(reply().getAttribute('aria-describedby')).toBe(
      'revisionResponse-hint revisionResponse-error',
    );
    expect(document.title).toBe(
      `Error: Response to revisions or clarifications - ${serviceName} - GOV.UK`,
    );
  });
});
