// @vitest-environment jsdom
import { TEAM_IDS } from '@fphd/auth';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { SHOWN_VERSION } from '../testing.ts';
import type { IndicatorAdminDetail } from './loader.ts';
import { ANSWERED_NOTES } from './notes-for-reviewers.testing.ts';
import { IndicatorOverviewPage } from './page.tsx';

afterEach(cleanup);

const indicator: IndicatorAdminDetail = {
  id: '019a1b2c-3d4e-7f60-8a9b-0c1d2e3f4a5b',
  shortId: 90366,
  name: 'Life expectancy at birth',
  teamId: TEAM_IDS.teamA,
  publishedSlug: 'life-expectancy-at-birth',
  updatedAt: '2026-08-04T23:30:00.000Z',
  indicatorStatus: 'live',
  draftStatus: null,
  draftLocked: false,
  draftSubmissionStatus: null,
  draftReviewers: [],
  draftSubmissionNumber: null,
  draftScheduledPublishAt: null,
  nameVersion: SHOWN_VERSION,
  actions: [],
};

// The links and tabs read router state, so the page renders inside a router at its own address.
function renderPage(overrides: Partial<IndicatorAdminDetail> = {}, canEdit = true) {
  return render(
    <MemoryRouter initialEntries={[`/dashboard/indicators/${indicator.id}`]}>
      <IndicatorOverviewPage canEdit={canEdit} indicator={{ ...indicator, ...overrides }} />
    </MemoryRouter>,
  );
}

describe('IndicatorOverviewPage', () => {
  it('names the indicator and shows its public number', () => {
    renderPage();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Life expectancy at birth' }),
    ).toBeTruthy();
    expect(screen.getByText('ID: 90366')).toBeTruthy();
  });

  it('tags the indicator with its two statuses under the public number', () => {
    renderPage({ draftStatus: 'draft' });

    const tags = [...document.querySelectorAll('h1 ~ p .govuk-tag')];

    expect(tags.map((tag) => tag.textContent)).toEqual([
      'Indicator status: Live indicator',
      'Publishing status: Update incomplete',
    ]);
  });

  it('shows the publication date the draft asks for under the statuses, in UK time', () => {
    renderPage({ draftStatus: 'draft', draftScheduledPublishAt: '2027-04-01T08:30:00.000Z' });

    const line = document.querySelector('p:has(.govuk-tag) + p');
    expect(line?.textContent).toBe('Scheduled publication date: 1 April 2027 at 9:30am');
    expect(line?.querySelector('time')?.getAttribute('dateTime')).toBe('2027-04-01T08:30:00.000Z');
    expect(document.querySelector('h1 ~ p:has(.govuk-tag)')?.className).toBe(
      'govuk-!-margin-bottom-2',
    );
  });

  it('shows no publication date line while none is set', () => {
    renderPage({ draftStatus: 'draft' });

    expect(screen.queryByText(/Scheduled publication date/)).toBeNull();
    expect(document.querySelector('h1 ~ p:has(.govuk-tag)')?.className).toBe(
      'govuk-!-margin-bottom-6',
    );
  });

  it('offers the published page as an action for a published indicator', () => {
    renderPage();

    expect(screen.getByRole('tab', { name: 'Actions' })).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'View published indicator' }).getAttribute('href'),
    ).toBe('/indicator/life-expectancy-at-birth');
  });

  it('offers the task list as an action for a draft, which has no public page', () => {
    renderPage({ publishedSlug: null, indicatorStatus: 'new', draftStatus: 'draft' });

    expect(screen.queryByRole('link', { name: 'View published indicator' })).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Continue creating indicator' }).getAttribute('href'),
    ).toBe(`/publish/indicators/${indicator.id}/task-list`);
  });

  it('offers both actions for a draft that revises a published indicator', () => {
    renderPage({ draftStatus: 'draft' });

    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Continue updating indicator',
      'View published indicator',
    ]);
    expect(
      screen.getByRole('link', { name: 'Continue updating indicator' }).getAttribute('href'),
    ).toBe(`/publish/indicators/${indicator.id}/task-list`);
  });

  it('offers only the published page to someone who may not edit the indicator', () => {
    renderPage({ draftStatus: 'draft' }, false);

    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'View published indicator',
    ]);
  });

  it('offers no editing action for a published indicator, which has no draft', () => {
    renderPage();

    expect(screen.queryByRole('link', { name: /^Continue/ })).toBeNull();
  });

  it('offers no task list while the draft is locked for review', () => {
    renderPage({
      publishedSlug: null,
      indicatorStatus: 'new',
      draftStatus: 'draft',
      draftLocked: true,
      draftSubmissionStatus: 'submitted',
    });

    expect(screen.queryByRole('link', { name: /^Continue/ })).toBeNull();
  });

  it('offers the notes for reviewers in a tab after the actions to someone who may read them', () => {
    render(
      <MemoryRouter initialEntries={[`/dashboard/indicators/${indicator.id}`]}>
        <IndicatorOverviewPage
          canEdit={false}
          indicator={{ ...indicator, draftStatus: 'draft' }}
          notesForReviewers={ANSWERED_NOTES}
        />
      </MemoryRouter>,
    );

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Actions',
      'Notes for reviewers',
    ]);
    expect(screen.getByRole('heading', { level: 2, name: 'Notes for reviewers' })).toBeTruthy();
  });

  it('offers no notes for reviewers to someone who may not read them', () => {
    renderPage({ draftStatus: 'draft' });

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Actions']);
  });

  it('shows something the publisher needs to know in an important banner', () => {
    render(
      <MemoryRouter initialEntries={[`/dashboard/indicators/${indicator.id}`]}>
        <IndicatorOverviewPage
          canEdit
          indicator={indicator}
          notification={{ type: 'important', text: 'This cannot be edited.' }}
        />
      </MemoryRouter>,
    );

    const banner = screen.getByRole('region', { name: 'Important' });
    expect(banner.textContent).toContain('This cannot be edited.');
  });

  it('shows a success in a success banner', () => {
    render(
      <MemoryRouter initialEntries={[`/dashboard/indicators/${indicator.id}`]}>
        <IndicatorOverviewPage
          canEdit
          indicator={indicator}
          notification={{ type: 'success', text: 'It worked.' }}
        />
      </MemoryRouter>,
    );

    const banner = screen.getByRole('alert');
    expect(banner.textContent).toContain('Success');
    expect(banner.textContent).toContain('It worked.');
  });

  it('offers to withdraw a submission the publisher may withdraw', () => {
    renderPage({
      publishedSlug: null,
      indicatorStatus: 'new',
      draftStatus: 'draft',
      draftLocked: true,
      draftSubmissionStatus: 'submitted',
      draftSubmissionNumber: 1,
      actions: ['withdraw'],
    });

    expect(screen.getByRole('link', { name: 'Withdraw submission' }).getAttribute('href')).toBe(
      `/publish/indicators/${indicator.id}/withdraw-submission`,
    );
  });

  it('offers no withdrawal the workflow does not allow the user', () => {
    renderPage({ draftStatus: 'draft', draftLocked: true, draftSubmissionStatus: 'submitted' });

    expect(screen.queryByRole('link', { name: 'Withdraw submission' })).toBeNull();
  });

  const submitted: Partial<IndicatorAdminDetail> = {
    publishedSlug: null,
    indicatorStatus: 'new',
    draftStatus: 'draft',
    draftLocked: true,
    draftSubmissionStatus: 'submitted',
    draftSubmissionNumber: 1,
    actions: ['assign_reviewers'],
  };

  it('offers an IMRG manager a button to assign reviewers to a submission', () => {
    renderPage(submitted, false);

    expect(
      screen.getByRole('button', { name: 'Assign reviewers to indicator' }).getAttribute('href'),
    ).toBe(`/dashboard/indicators/${indicator.id}/assign-reviewers`);
    expect(screen.queryByRole('link', { name: 'Change reviewers for this indicator' })).toBeNull();
    expect(screen.queryByText(/no actions available/)).toBeNull();
  });

  it('offers an IMRG manager a link to change the reviewers once they are assigned', () => {
    renderPage({ ...submitted, draftSubmissionStatus: 'in_review' }, false);

    expect(
      screen
        .getByRole('link', { name: 'Change reviewers for this indicator' })
        .getAttribute('href'),
    ).toBe(`/dashboard/indicators/${indicator.id}/assign-reviewers`);
    expect(screen.queryByRole('button', { name: 'Assign reviewers to indicator' })).toBeNull();
  });

  it('offers no reviewer assignment the workflow does not allow the user', () => {
    renderPage({ ...submitted, actions: [] }, false);

    expect(screen.queryByRole('button', { name: 'Assign reviewers to indicator' })).toBeNull();
    expect(screen.getByText('There are no actions available for this indicator yet.')).toBeTruthy();
  });
});
