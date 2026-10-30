// @vitest-environment jsdom

import { serviceName } from '@fphd/ui';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { SHOWN_VERSION } from '../testing.ts';
import { DeleteTopicPage, EditTopicPage, NewTopicPage } from './pages.tsx';
import { deleteTopicPath, editTopicPath } from './paths.ts';

afterEach(cleanup);

const topic = {
  id: '019a1b2c-3d4e-7f60-8a9b-0c1d2e3f4a5b',
  slug: 'smoking',
  createdAt: '2026-08-01T09:30:00.000Z',
  title: 'Smoking',
  description: 'About smoking.',
  updatedAt: '2026-09-01T09:30:00.000Z',
  linkedIndicatorCount: 0,
  version: SHOWN_VERSION,
};

// The page's links read router state, so it renders inside a router.
function renderPage(linkedIndicatorCount = 0) {
  return render(
    <MemoryRouter>
      <DeleteTopicPage topic={{ ...topic, linkedIndicatorCount }} />
    </MemoryRouter>,
  );
}

function renderEditPage(linkedIndicatorCount: number) {
  return render(
    <MemoryRouter>
      <EditTopicPage
        linkedIndicatorCount={linkedIndicatorCount}
        topicId={topic.id}
        values={values}
        version={SHOWN_VERSION}
      />
    </MemoryRouter>,
  );
}

const values = { title: 'Smoking', slug: 'smoking', description: 'About smoking.' };

describe('NewTopicPage', () => {
  it('titles the document after the page', () => {
    render(
      <MemoryRouter>
        <NewTopicPage />
      </MemoryRouter>,
    );

    expect(document.title).toBe(`Add a topic - ${serviceName} - GOV.UK`);
  });

  it('starts the title with "Error: " when the submission is rejected', () => {
    render(
      <MemoryRouter>
        <NewTopicPage fieldErrors={{ title: 'Enter a topic name' }} values={values} />
      </MemoryRouter>,
    );

    expect(document.title).toBe(`Error: Add a topic - ${serviceName} - GOV.UK`);
  });
});

describe('EditTopicPage', () => {
  it('titles the document after the page', () => {
    render(
      <MemoryRouter>
        <EditTopicPage
          linkedIndicatorCount={0}
          topicId={topic.id}
          values={values}
          version={SHOWN_VERSION}
        />
      </MemoryRouter>,
    );

    expect(document.title).toBe(`Edit topic - ${serviceName} - GOV.UK`);
  });

  it('starts the title with "Error: " when the save is rejected', () => {
    render(
      <MemoryRouter>
        <EditTopicPage
          fieldErrors={{ slug: 'This slug is already used' }}
          linkedIndicatorCount={0}
          topicId={topic.id}
          values={values}
          version={SHOWN_VERSION}
        />
      </MemoryRouter>,
    );

    expect(document.title).toBe(`Error: Edit topic - ${serviceName} - GOV.UK`);
  });

  it('offers to delete a topic no indicator links to', () => {
    renderEditPage(0);

    expect(screen.getByText('No indicators are linked to this topic.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Delete topic' }).getAttribute('href')).toBe(
      deleteTopicPath(topic.id),
    );
  });

  it.each([
    [1, '1 indicator is linked to this topic.'],
    [3, '3 indicators are linked to this topic.'],
  ])('shows %i linked and says why there is no Delete topic link', (count, sentence) => {
    renderEditPage(count);

    expect(screen.getByText(new RegExp(`^${sentence}`))).toBeTruthy();
    expect(
      screen.getByText(/You cannot delete a topic while indicators are linked to it/),
    ).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Delete topic' })).toBeNull();
  });

  it('sends back the version of the topic it was shown', () => {
    const { container } = renderEditPage(0);

    expect(container.querySelector<HTMLInputElement>('input[name="version"]')?.value).toBe(
      SHOWN_VERSION,
    );
  });

  it('debounces Save, so a double click saves the topic once', () => {
    render(
      <MemoryRouter>
        <EditTopicPage
          linkedIndicatorCount={0}
          topicId={topic.id}
          values={values}
          version={SHOWN_VERSION}
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('button', { name: 'Save' }).getAttribute('data-prevent-double-click'),
    ).toBe('true');
  });
});

describe('DeleteTopicPage', () => {
  it('names the topic being deleted and warns it cannot be undone', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Delete topic' })).toBeTruthy();
    expect(screen.getByText('Smoking', { selector: 'strong' })).toBeTruthy();
    expect(screen.getByText(/This cannot be undone/)).toBeTruthy();
  });

  it('confirms with a warning button in a plain form', () => {
    renderPage();

    const button = screen.getByRole('button', { name: 'Delete topic' });

    expect(button.className).toContain('govuk-button--warning');
    expect(button.closest('form')?.getAttribute('method')).toBe('post');
    expect(button.getAttribute('data-prevent-double-click')).toBe('true');
  });

  it('offers a way back to editing the topic', () => {
    renderPage();

    expect(screen.getByRole('link', { name: 'Cancel' }).getAttribute('href')).toBe(
      editTopicPath(topic.id),
    );
  });

  it('explains that a linked topic cannot be deleted, offering no button', () => {
    renderPage(2);

    expect(screen.getByRole('heading', { name: 'Delete topic' })).toBeTruthy();
    expect(screen.getByText(/You cannot delete/).textContent).toBe(
      'You cannot delete Smoking because 2 indicators are linked to it.',
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('link', { name: 'Return to edit topic' }).getAttribute('href')).toBe(
      editTopicPath(topic.id),
    );
  });
});
