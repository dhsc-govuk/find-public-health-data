// @vitest-environment jsdom
import { serviceName } from '@fphd/ui';
import { renderMarkdown } from '@fphd/ui/markdown';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { taskStatuses } from '../testing.ts';

import type { IndicatorTaskList, ReviewerRequests } from './loader.ts';
import { IndicatorTaskListPage } from './page.tsx';

afterEach(cleanup);

const taskList: IndicatorTaskList = {
  indicator: {
    id: '019a1b2c-3d4e-7f60-8a9b-0c1d2e3f4a5b',
    shortId: 90366,
    name: 'Life expectancy at birth',
    indicatorStatus: 'new',
    draftStatus: 'draft',
    draftSubmissionStatus: null,
    draftResponseKind: null,
  },
  isUpdate: false,
  canSubmit: true,
  changedTasks: [],
  review: null,
  draftUpdatedAt: '2026-10-22T09:30:00.123Z',
  editable: true,
  actions: ['submit'],
  tasks: { ...taskStatuses('not_started'), name: 'completed' },
};

function renderPage(
  overrides: Partial<IndicatorTaskList> = {},
  formError?: string,
  offersSampleAnswers = false,
  requests: ReviewerRequests | null = null,
) {
  return render(
    <MemoryRouter initialEntries={[`/publish/indicators/${taskList.indicator.id}/task-list`]}>
      <IndicatorTaskListPage
        requests={requests}
        taskList={{ ...taskList, ...overrides }}
        offersSampleAnswers={offersSampleAnswers}
        formError={formError}
      />
    </MemoryRouter>,
  );
}

/** The rows of one group, which is the list following its heading. */
function group(title: string) {
  const heading = screen.getByRole('heading', { level: 2, name: title });
  const list = heading.nextElementSibling;

  if (!(list instanceof HTMLElement)) throw new Error(`no task list under ${title}`);

  return within(list);
}

describe('IndicatorTaskListPage', () => {
  it('names the indicator and captions it with its public number', () => {
    renderPage();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Life expectancy at birth' }),
    ).toBeTruthy();
    expect(screen.getByText('ID: 90366')).toBeTruthy();
  });

  it('tags the indicator with its two statuses under the heading', () => {
    renderPage({ isUpdate: true, indicator: { ...taskList.indicator, indicatorStatus: 'live' } });

    // The tags follow the public number, under the heading.
    const tags = [...document.querySelectorAll('h1 ~ p .govuk-tag')];

    expect(tags.map((tag) => tag.textContent)).toEqual([
      'Indicator status: Live indicator',
      'Publishing status: Update incomplete',
    ]);
  });

  it('groups the fields a publisher completes', () => {
    renderPage({ canSubmit: false });

    expect(
      screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent),
    ).toEqual(['Data', 'Metadata', 'Publishing', 'Notes for reviewers (not visible to consumers)']);
    expect(group('Data').getAllByRole('listitem')).toHaveLength(7);
    expect(group('Metadata').getAllByRole('listitem')).toHaveLength(10);
    expect(group('Publishing').getAllByRole('listitem')).toHaveLength(2);
    expect(
      group('Notes for reviewers (not visible to consumers)').getAllByRole('listitem'),
    ).toHaveLength(3);
  });

  it('shows the status the API reports for a task it judges', () => {
    renderPage();

    const name = group('Metadata').getByRole('link', { name: 'Name' });

    expect(name.getAttribute('href')).toBe(`/publish/indicators/${taskList.indicator.id}/name`);
    expect(document.getElementById(name.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'Completed',
    );
  });

  it('follows the API when it reports a task as not started', () => {
    renderPage({ tasks: taskStatuses('not_started') });

    const name = group('Metadata').getByRole('link', { name: 'Name' });
    const status = document.getElementById(name.getAttribute('aria-describedby') ?? '');

    expect(status?.textContent).toBe('Incomplete');
  });

  it('links the data table to its upload page until a file has loaded', () => {
    renderPage();

    const dataTable = group('Data').getByRole('link', { name: 'Data table' });

    expect(dataTable.getAttribute('href')).toBe(
      `/publish/indicators/${taskList.indicator.id}/data-table`,
    );
  });

  it.each([
    ['in_progress', 'Incomplete'],
    ['completed', 'Completed'],
  ] as const)('links a data table that is %s to its check page', (status, label) => {
    renderPage({ tasks: { ...taskList.tasks, 'data-table': status } });

    const dataTable = group('Data').getByRole('link', { name: 'Data table' });

    expect(dataTable.getAttribute('href')).toBe(
      `/publish/indicators/${taskList.indicator.id}/data-table/check`,
    );
    expect(
      document.getElementById(dataTable.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toBe(label);
  });

  it('links every task to the page that completes it', () => {
    renderPage();

    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Data table',
      'Value type and units',
      'Sex, gender and ethnicity',
      'Ages',
      'Period type',
      'Polarity',
      'Data quality',
      'Name',
      'Definition and rationale',
      'Numerator',
      'Denominator',
      'How the indicator was calculated',
      'Confidence intervals',
      'Benchmarking',
      'Other notes and caveats',
      'Tagging',
      'Copyright and data re-use',
      'Update frequency',
      'Publishing date',
      'Variance and quality',
      'Justifications',
      'Other comments',
    ]);
  });

  const NOTES = 'Notes for reviewers (not visible to consumers)';

  it.each([
    ['Data', 'Value type and units', 'value-type-and-units'],
    ['Data', 'Sex, gender and ethnicity', 'sex-gender-and-ethnicity'],
    ['Data', 'Ages', 'ages'],
    ['Data', 'Period type', 'period-type'],
    ['Data', 'Polarity', 'polarity'],
    ['Data', 'Data quality', 'data-quality'],
    ['Metadata', 'Definition and rationale', 'definition-and-rationale'],
    ['Metadata', 'Numerator', 'numerator'],
    ['Metadata', 'Denominator', 'denominator'],
    ['Metadata', 'How the indicator was calculated', 'calculation'],
    ['Metadata', 'Confidence intervals', 'confidence-intervals'],
    ['Metadata', 'Benchmarking', 'benchmarking'],
    ['Metadata', 'Other notes and caveats', 'other-notes-and-caveats'],
    ['Metadata', 'Tagging', 'tagging'],
    ['Metadata', 'Copyright and data re-use', 'copyright-and-data-reuse'],
    ['Publishing', 'Update frequency', 'update-frequency'],
    ['Publishing', 'Publishing date', 'publishing-date'],
    [NOTES, 'Variance and quality', 'variance-and-quality'],
    [NOTES, 'Justifications', 'justifications'],
    [NOTES, 'Other comments', 'other-comments'],
  ] as const)('links %s: %s to its page, with the status the API reports', (title, name, key) => {
    renderPage({ tasks: { ...taskList.tasks, [key]: 'completed' } });

    const row = group(title).getByRole('link', { name });

    expect(row.getAttribute('href')).toBe(`/publish/indicators/${taskList.indicator.id}/${key}`);
    expect(document.getElementById(row.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'Completed',
    );
  });

  it('tells the publisher the sections can be completed in any order and completed ones are saved', () => {
    renderPage();

    expect(
      screen.getByText(
        'You can complete these sections in any order. If you exit at any point, any section you have completed will be saved.',
      ).className,
    ).toContain('govuk-inset-text');
  });

  it('tags a task that is not started as incomplete and leaves a completed one as text', () => {
    renderPage();

    expect(screen.getAllByText('Incomplete')[0]?.className).toContain('govuk-tag--blue');
    expect(screen.getByText('Completed').className).not.toContain('govuk-tag');
  });

  it('offers submission once every task is complete, confirming the draft as shown', () => {
    renderPage();

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'By continuing, you confirm that you have checked all data and metadata is correct.',
      }),
    ).toBeTruthy();
    const button = screen.getByRole('button', { name: 'Submit for approval' });
    const form = button.closest('form');
    expect(form?.getAttribute('method')).toBe('post');
    expect(form?.getAttribute('action')).toBe(
      `/publish/indicators/${taskList.indicator.id}/task-list`,
    );
    expect(form?.querySelector<HTMLInputElement>('input[name="draftUpdatedAt"]')?.value).toBe(
      '2026-10-22T09:30:00.123Z',
    );
  });

  it.each<[string, Partial<IndicatorTaskList>]>([
    ['while a task is incomplete', { canSubmit: false }],
    ["on an update's task list, which cannot be submitted yet", { isUpdate: true, actions: [] }],
    ['to a user the workflow does not let submit', { actions: [] }],
  ])('offers no submission %s', (_, overrides) => {
    renderPage(overrides);

    expect(screen.queryByRole('button', { name: 'Submit for approval' })).toBeNull();
    expect(screen.queryByText(/By continuing/)).toBeNull();
  });

  it('offers to fill in the remaining tasks with sample answers when told to', () => {
    renderPage({ canSubmit: false }, undefined, true);

    const button = screen.getByRole('button', {
      name: 'Fill in the remaining tasks with sample answers',
    });
    const form = button.closest('form');
    expect(form?.getAttribute('method')).toBe('post');
    expect(form?.getAttribute('action')).toBe(
      `/publish/indicators/${taskList.indicator.id}/sample-answers`,
    );
    expect(form?.textContent).toContain(
      'It replaces any answers to tasks not yet completed, and any data table not yet confirmed.',
    );
  });

  it('offers no sample answers unless told to', () => {
    renderPage({ canSubmit: false });

    expect(screen.queryByRole('button', { name: /sample answers/ })).toBeNull();
  });

  it('shows why a submission was refused in the error summary', () => {
    renderPage({}, 'Complete every task before you submit this indicator.');

    const summary = screen.getByRole('alert');
    expect(summary.textContent).toContain('There is a problem');
    expect(summary.textContent).toContain('Complete every task before you submit this indicator.');
    expect(document.title).toBe(`Error: Indicator task list - ${serviceName} - GOV.UK`);
  });

  it('titles the page without an error when nothing was refused', () => {
    renderPage();

    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.title).toBe(`Indicator task list - ${serviceName} - GOV.UK`);
  });
});

describe('IndicatorTaskListPage for an update to a live indicator', () => {
  const update: Partial<IndicatorTaskList> = {
    isUpdate: true,
    indicator: { ...taskList.indicator, indicatorStatus: 'live' },
    tasks: {
      ...taskStatuses('completed'),
      'publishing-date': 'not_started',
      'update-summary': 'not_started',
    },
    canSubmit: false,
  };

  /** The status beside a task, found by its name whether or not it links anywhere. */
  function statusOf(groupTitle: string, name: string) {
    const row = group(groupTitle)
      .getAllByRole('listitem')
      .find((item) => item.textContent?.startsWith(name));

    return row?.querySelector('.govuk-task-list__status')?.textContent;
  }

  it('ends the Publishing group with the update summary', () => {
    renderPage(update);

    expect(
      group('Publishing')
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      expect.stringMatching(/^Update frequency/),
      expect.stringMatching(/^Publishing date/),
      expect.stringMatching(/^Update summary/),
    ]);
  });

  it('reads each task changed or unchanged against the live indicator', () => {
    renderPage({ ...update, changedTasks: ['polarity', 'variance-and-quality'] });

    expect(statusOf('Data', 'Polarity')).toBe('Changed');
    expect(statusOf('Data', 'Data table')).toBe('Unchanged');
    expect(statusOf('Metadata', 'Name')).toBe('Unchanged');
    expect(statusOf('Notes for reviewers (not visible to consumers)', 'Variance and quality')).toBe(
      'Changed',
    );
    expect(group('Data').getByRole('link', { name: 'Polarity' })).toBeTruthy();
    expect(group('Data').getByRole('link', { name: 'Data table' })).toBeTruthy();
  });

  it('has no changes to publish, and no links to the publishing date and summary, until a task changes', () => {
    renderPage(update);

    expect(statusOf('Publishing', 'Publishing date')).toBe('No changes to publish');
    expect(statusOf('Publishing', 'Update summary')).toBe('No changes to publish');
    expect(group('Publishing').queryByRole('link', { name: 'Publishing date' })).toBeNull();
    expect(group('Publishing').queryByRole('link', { name: 'Update summary' })).toBeNull();
    expect(group('Publishing').getByRole('link', { name: 'Update frequency' })).toBeTruthy();
  });

  it('links the publishing date and summary once a task changes, complete once answered', () => {
    renderPage({
      ...update,
      changedTasks: ['polarity'],
      tasks: { ...update.tasks, 'update-summary': 'completed' } as IndicatorTaskList['tasks'],
    });

    const id = taskList.indicator.id;
    expect(
      group('Publishing').getByRole('link', { name: 'Publishing date' }).getAttribute('href'),
    ).toBe(`/publish/indicators/${id}/publishing-date`);
    expect(
      group('Publishing').getByRole('link', { name: 'Update summary' }).getAttribute('href'),
    ).toBe(`/publish/indicators/${id}/update-summary`);
    expect(statusOf('Publishing', 'Publishing date')).toBe('Incomplete');
    expect(statusOf('Publishing', 'Update summary')).toBe('Complete');
  });

  it('leaves the update summary off a new indicator', () => {
    renderPage();

    expect(group('Publishing').queryByText('Update summary')).toBeNull();
  });
});

describe('IndicatorTaskListPage for a draft sent back for changes', () => {
  const requests: ReviewerRequests = {
    advised: false,
    clarificationRequest: {
      reviewerName: 'Ali Reviewer',
      notes: renderMarkdown('Which **years** are counted?'),
    },
    flags: {
      polarity: {
        reviewerName: 'Sam Reviewer',
        notes: renderMarkdown('Is higher better?'),
        cleared: false,
      },
      name: {
        reviewerName: 'Sam Reviewer',
        notes: renderMarkdown('A shorter name'),
        cleared: true,
      },
    },
    replied: false,
  };
  const sentBack: Partial<IndicatorTaskList> = {
    tasks: taskStatuses('completed'),
    canSubmit: false,
    actions: ['resubmit'],
  };

  function renderSentBack(overrides: Partial<IndicatorTaskList> = {}, shown = requests) {
    return renderPage({ ...sentBack, ...overrides }, undefined, false, shown);
  }

  /** The item of a task in the list under a group's heading. */
  function row(groupTitle: string, task: string) {
    const link = group(groupTitle).getByRole('link', { name: task });
    const li = link.closest('li');
    if (li === null) throw new Error(`no item for ${task}`);
    return within(li);
  }

  it('widens the page and keeps each group a task list', () => {
    renderSentBack();

    expect(document.querySelector('.govuk-grid-column-three-quarters')).not.toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
    expect(group('Metadata').getAllByRole('listitem')).toHaveLength(10);
  });

  it('shows a flagged task’s notes, tagged as needing revisions until it is saved', () => {
    renderSentBack();

    const polarity = row('Data', 'Polarity');
    const inset = polarity.getByText('Is higher better?').closest('.govuk-inset-text');
    expect(inset?.closest('.govuk-task-list__hint')).not.toBeNull();
    expect(inset?.textContent).toBe('Comment from Sam Reviewer:Is higher better?');
    expect(polarity.getByText('Comment from Sam Reviewer:').className).toContain(
      'govuk-!-font-weight-bold',
    );
    expect(polarity.getByText('Revisions needed').className).toContain('govuk-tag--red');
  });

  it('keeps a saved flag’s notes beside the task’s own status', () => {
    renderSentBack();

    const name = row('Metadata', 'Name');
    expect(name.getByText('A shorter name')).toBeTruthy();
    expect(name.getByText('Completed').className).not.toContain('govuk-tag');
  });

  it('describes a flagged task’s link with the reviewer’s comment', () => {
    renderSentBack();

    expect(
      screen.getByRole('link', { name: 'Polarity' }).getAttribute('aria-describedby'),
    ).not.toBeNull();
    expect(
      row('Data', 'Polarity').getByRole('link', {
        description: /Comment from Sam Reviewer:\s*Is higher better\?/,
      }),
    ).toBeTruthy();
  });

  it('tags a task flagged before IMRG as having revisions advised', () => {
    renderSentBack({}, { ...requests, advised: true });

    expect(row('Data', 'Polarity').getByText('Revisions advised').className).toContain(
      'govuk-tag--orange',
    );
  });

  it('gives a task nobody flagged no hint', () => {
    renderSentBack();

    const item = screen.getByRole('link', { name: 'Data table' }).closest('li');
    expect(item?.querySelector('.govuk-task-list__hint')).toBeNull();
    expect(row('Data', 'Data table').getByText('Completed')).toBeTruthy();
  });

  it('ends the notes for reviewers with the reply, beside the clarification request', () => {
    renderSentBack();

    const reply = row(
      'Notes for reviewers (not visible to consumers)',
      'Response to revisions or clarifications',
    );
    expect(
      reply
        .getByRole('link', { name: 'Response to revisions or clarifications' })
        .getAttribute('href'),
    ).toBe(`/publish/indicators/${taskList.indicator.id}/revision-response`);
    expect(reply.getByText('Comment from Ali Reviewer:')).toBeTruthy();
    expect(reply.getByText('years').tagName).toBe('STRONG');
    expect(reply.getByText('Incomplete').className).toContain('govuk-tag--blue');
  });

  it('shows the reply as completed once written', () => {
    renderSentBack({}, { ...requests, replied: true });

    expect(
      row(
        'Notes for reviewers (not visible to consumers)',
        'Response to revisions or clarifications',
      ).getByText('Completed'),
    ).toBeTruthy();
  });

  it('offers resubmission once the round is answered, and not before', () => {
    renderSentBack();
    expect(screen.queryByRole('button', { name: 'Submit for approval' })).toBeNull();

    cleanup();
    renderSentBack({ canSubmit: true });
    expect(screen.getByRole('button', { name: 'Submit for approval' })).toBeTruthy();
  });

  it('keeps the two-thirds page and the task lists without a round', () => {
    renderPage();

    expect(document.querySelector('.govuk-grid-column-two-thirds')).not.toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
