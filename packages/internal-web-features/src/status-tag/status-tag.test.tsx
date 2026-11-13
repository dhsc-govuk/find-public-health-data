// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { StatusTag, type StatusTagProps } from './status-tag.tsx';

afterEach(cleanup);

function tag(label: string) {
  const element = screen.getByText(label);

  expect(element.className).toContain('govuk-tag');
  expect(element.className).toContain('fphd-status-tag');

  return element.className;
}

describe('StatusTag', () => {
  it.each([
    ['new', 'New indicator', 'blue'],
    ['live', 'Live indicator', 'teal'],
  ] as const)('shows an indicator status of %s as %s', (status, label, colour) => {
    render(<StatusTag type="indicator" status={status} />);

    expect(tag(label)).toContain(`govuk-tag--${colour}`);
  });

  it.each([
    ['new', 'draft', null, null, 'Incomplete', 'blue'],
    ['new', 'draft', 'submitted', null, 'Pending review', 'yellow'],
    ['new', 'draft', 'in_review', null, 'Pending review', 'yellow'],
    ['new', 'draft', 'withdrawn', null, 'Incomplete', 'blue'],
    [
      'new',
      'draft',
      'changes_requested',
      'pre_imrg_feedback',
      'Revisions or clarifications advised',
      'orange',
    ],
    ['new', 'draft', 'changes_requested', 'minor_revisions', 'Minor revisions needed', 'orange'],
    ['new', 'draft', 'changes_requested', 'major_revisions', 'Major revisions needed', 'red'],
    ['new', 'draft', 'approved', 'approved', 'Pending scheduling', 'yellow'],
    ['new', 'scheduled', 'approved', 'approved', 'Publishing scheduled', 'yellow'],
    ['live', 'draft', 'approved', 'approved', 'Update pending scheduling', 'yellow'],
    ['live', 'scheduled', 'approved', 'approved', 'Update publishing scheduled', 'yellow'],
    ['live', null, null, null, 'Published', 'green'],
    ['live', 'draft', null, null, 'Update incomplete', 'blue'],
  ] as const)(
    'shows a %s indicator with a draft status of %s, a submission %s and a response %s as %s',
    (indicatorStatus, draftStatus, draftSubmissionStatus, draftResponseKind, label, colour) => {
      render(
        <StatusTag
          type="publishing"
          indicatorStatus={indicatorStatus}
          draftStatus={draftStatus}
          draftSubmissionStatus={draftSubmissionStatus}
          draftResponseKind={draftResponseKind}
          draftUpdateDecision={null}
        />,
      );

      expect(tag(label)).toContain(`govuk-tag--${colour}`);
    },
  );

  it.each([
    [null, 'Update pending decision'],
    ['imrg_review', 'Update pending review'],
  ] as const)(
    'shows a submitted update with a decision of %s as %s, in yellow',
    (draftUpdateDecision, label) => {
      render(
        <StatusTag
          type="publishing"
          indicatorStatus="live"
          draftStatus="draft"
          draftSubmissionStatus="submitted"
          draftResponseKind={null}
          draftUpdateDecision={draftUpdateDecision}
        />,
      );

      expect(tag(label)).toContain('govuk-tag--yellow');
    },
  );

  it.each([
    ['submitted', null],
    ['in_review', null],
    ['changes_requested', 'major_revisions'],
    [null, null],
  ] as const)(
    'names a scheduled version as scheduled over a submission %s',
    (draftSubmissionStatus, draftResponseKind) => {
      render(
        <StatusTag
          type="publishing"
          indicatorStatus="new"
          draftStatus="scheduled"
          draftSubmissionStatus={draftSubmissionStatus}
          draftResponseKind={draftResponseKind}
          draftUpdateDecision={null}
        />,
      );

      expect(tag('Publishing scheduled')).toContain('govuk-tag--yellow');
    },
  );

  it('shows nothing for a new indicator with no draft, which cannot be made', () => {
    const { container } = render(
      <StatusTag
        type="publishing"
        indicatorStatus="new"
        draftStatus={null}
        draftSubmissionStatus={null}
        draftResponseKind={null}
        draftUpdateDecision={null}
      />,
    );

    expect(container.innerHTML).toBe('');
  });

  it.each<[string, StatusTagProps, string, string]>([
    ['an indicator', { type: 'indicator', status: 'live' }, 'Indicator status: ', 'Live indicator'],
    [
      'a publishing',
      {
        type: 'publishing',
        indicatorStatus: 'live',
        draftStatus: null,
        draftSubmissionStatus: null,
        draftResponseKind: null,
        draftUpdateDecision: null,
      },
      'Publishing status: ',
      'Published',
    ],
  ])('names %s status for screen readers only', (_, props, prefix, label) => {
    render(<StatusTag {...props} />);

    const hidden = screen.getByText(prefix.trim());

    expect(hidden.className).toBe('govuk-visually-hidden');
    expect(hidden.parentElement?.textContent).toBe(`${prefix}${label}`);
  });

  it('leaves the name out, and shortens the wording, where something else already gives it', () => {
    render(<StatusTag type="indicator" status="live" labelled={false} />);

    expect(tag('Live')).toBeTruthy();
    expect(document.querySelector('.govuk-visually-hidden')).toBeNull();
  });

  it('does not name a task status, which is read out with its task', () => {
    render(<StatusTag type="task" status="not_started" />);

    expect(document.querySelector('.govuk-visually-hidden')).toBeNull();
  });

  it('shows a task that is not started as incomplete, in the tag GOV.UK gives it', () => {
    render(<StatusTag type="task" status="not_started" />);

    expect(tag('Incomplete')).toContain('govuk-tag--blue');
  });

  it('shows a task in progress as incomplete, in the tag GOV.UK gives it', () => {
    render(<StatusTag type="task" status="in_progress" />);

    expect(tag('Incomplete')).toContain('govuk-tag--blue');
  });

  it.each([
    ['needed', 'Revisions needed', 'govuk-tag--red'],
    ['advised', 'Revisions advised', 'govuk-tag--orange'],
  ] as const)('tags a flagged task whose revisions are %s', (status, label, colour) => {
    render(<StatusTag type="revision" status={status} />);

    expect(tag(label)).toContain(colour);
    expect(document.querySelector('.govuk-visually-hidden')).toBeNull();
  });

  it('shows a completed task as plain text, as GOV.UK does', () => {
    const { container } = render(<StatusTag type="task" status="completed" />);

    expect(container.textContent).toBe('Completed');
    expect(container.querySelector('.govuk-tag')).toBeNull();
  });
});
