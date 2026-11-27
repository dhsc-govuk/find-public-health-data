// @vitest-environment jsdom

import { serviceName } from '@fphd/ui';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { SHOWN_VERSION } from '../testing.ts';
import { AdminTopicsPage, DeleteTopicPage, EditTopicPage, NewTopicPage } from './pages.tsx';
import { deleteTopicPath, editTopicPath, NEW_TOPIC_PATH, TOPICS_ADMIN_PATH } from './paths.ts';

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

function renderInRouter(page: ReactNode) {
  return render(<MemoryRouter>{page}</MemoryRouter>);
}

describe('AdminTopicsPage', () => {
  // 23:30 UTC on the 4th is 00:30 on the 5th in London, the display zone, not the server's.
  const summary = { ...topic, updatedAt: '2026-08-04T23:30:00.000Z' };

  it('links each topic name to its edit page and shows when it last changed', () => {
    renderInRouter(<AdminTopicsPage topics={[summary]} />);

    expect(screen.getByRole('link', { name: 'Smoking' }).getAttribute('href')).toBe(
      editTopicPath(topic.id),
    );
    expect(screen.getByText('5 Aug 2026')).toBeTruthy();
  });

  it('names the columns a publisher needs', () => {
    renderInRouter(<AdminTopicsPage topics={[summary]} />);

    for (const heading of ['Topic name', 'Slug', 'Last updated']) {
      expect(screen.getByRole('columnheader', { name: heading })).toBeTruthy();
    }
  });

  it('offers a way to add a topic', () => {
    renderInRouter(<AdminTopicsPage topics={[summary]} />);

    // The GOV.UK button component renders an anchor with role="button", not a plain link.
    expect(screen.getByRole('button', { name: 'Add a topic' }).getAttribute('href')).toBe(
      NEW_TOPIC_PATH,
    );
  });

  it('shows the message a create or delete left behind', () => {
    renderInRouter(<AdminTopicsPage notification="Topic deleted" topics={[summary]} />);

    expect(screen.getByText('Topic deleted')).toBeTruthy();
  });
});

describe('NewTopicPage', () => {
  it('starts from an empty form that posts back to the same URL', () => {
    const { container } = renderInRouter(<NewTopicPage />);

    expect(screen.getByLabelText('Topic name').getAttribute('value')).toBe('');
    expect(screen.getByLabelText('Description').textContent).toBe('');

    const form = container.querySelector('form');
    expect(form?.getAttribute('method')).toBe('post');
    expect(form?.hasAttribute('action')).toBe(false);
    expect(screen.getByRole('button', { name: 'Create topic' })).toBeTruthy();
  });

  it('keeps what was typed and shows field errors when a create is rejected', () => {
    renderInRouter(
      <NewTopicPage fieldErrors={{ slug: 'This slug is already used' }} values={values} />,
    );

    expect(screen.getByLabelText('Topic name').getAttribute('value')).toBe('Smoking');
    expect(screen.getByRole('alert').textContent).toContain('This slug is already used');
  });

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

  it('pre-fills the form and offers a way back to the list', () => {
    renderEditPage(0);

    expect(screen.getByLabelText('Topic name').getAttribute('value')).toBe('Smoking');
    expect(screen.getByLabelText('Slug').getAttribute('value')).toBe('smoking');
    expect(screen.getByLabelText('Description').textContent).toBe('About smoking.');
    expect(screen.getByRole('link', { name: 'Return to topic list' }).getAttribute('href')).toBe(
      TOPICS_ADMIN_PATH,
    );
  });

  it('submits back to the same URL with a plain form, so it works without JavaScript', () => {
    const { container } = renderEditPage(0);

    const form = container.querySelector('form');
    expect(form?.getAttribute('method')).toBe('post');
    expect(form?.hasAttribute('action')).toBe(false);
  });

  it('shows the success message the save left behind', () => {
    renderInRouter(
      <EditTopicPage
        linkedIndicatorCount={0}
        notification="Topic updated"
        topicId={topic.id}
        values={values}
        version={SHOWN_VERSION}
      />,
    );

    expect(screen.getByText('Topic updated')).toBeTruthy();
  });

  it('shows no notification banner when there is nothing to report', () => {
    const { container } = renderEditPage(0);

    expect(container.querySelector('.govuk-notification-banner')).toBeNull();
  });

  it('summarises errors in field order, each linking to its control', () => {
    renderInRouter(
      <EditTopicPage
        linkedIndicatorCount={0}
        fieldErrors={{ description: 'Enter a description', title: 'Enter a topic name' }}
        topicId={topic.id}
        values={{ ...values, title: '', description: '' }}
        version={SHOWN_VERSION}
      />,
    );

    const links = [...screen.getByRole('alert').querySelectorAll('a')];

    expect(links.map((link) => link.textContent)).toEqual([
      'Enter a topic name',
      'Enter a description',
    ]);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '#title-input',
      '#description-input',
    ]);
  });

  // The message appears twice by design, once in the summary and once against the control, so
  // this looks for the one the field points at with aria-describedby.
  it('repeats each message against its own field and keeps what was typed', () => {
    const { container } = renderInRouter(
      <EditTopicPage
        linkedIndicatorCount={0}
        fieldErrors={{ slug: 'Enter a slug' }}
        topicId={topic.id}
        values={{ ...values, slug: '', title: 'A half-finished edit' }}
        version={SHOWN_VERSION}
      />,
    );

    expect(screen.getByLabelText('Slug').getAttribute('aria-describedby')).toContain('slug-error');
    expect(container.querySelector('#slug-error')?.textContent).toContain('Enter a slug');
    expect(screen.getByLabelText('Topic name').getAttribute('value')).toBe('A half-finished edit');
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
    expect(button.closest('form')?.hasAttribute('action')).toBe(false);
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
