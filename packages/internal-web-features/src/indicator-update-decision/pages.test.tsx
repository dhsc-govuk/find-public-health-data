// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { UpdateDecisionPage } from './pages.tsx';

afterEach(cleanup);

describe('UpdateDecisionPage', () => {
  it('asks what should happen to the update as the page heading, with four options', () => {
    render(
      <MemoryRouter>
        <UpdateDecisionPage
          fieldErrors={{}}
          formError={undefined}
          submissionNumber={2}
          values={{ updateDecision: '' }}
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'What should happen to this update?' }),
    ).toBeTruthy();
    expect(screen.getAllByRole('radio').map((radio) => radio.getAttribute('value'))).toEqual([
      'imrg_review',
      'request_revisions',
      'publish_with_history',
      'publish_without_history',
    ]);
    for (const label of [
      'IMRG review',
      'Request revisions',
      'Publish with visibility in history',
      'Publish without visibility in history',
    ]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    expect(document.querySelector('input[name="submissionNumber"]')?.getAttribute('value')).toBe(
      '2',
    );
  });

  it('links its error to the first option', () => {
    const message = 'Select what should happen to this update';
    render(
      <MemoryRouter>
        <UpdateDecisionPage
          fieldErrors={{ updateDecision: message }}
          formError={undefined}
          submissionNumber={2}
          values={{ updateDecision: '' }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: message }).getAttribute('href')).toBe(
      `#${screen.getByLabelText('IMRG review').id}`,
    );
  });
});
