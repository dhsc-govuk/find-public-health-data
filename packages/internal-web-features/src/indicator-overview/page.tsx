import {
  DocumentTitle,
  ErrorSummary,
  formatDate,
  GridColumn,
  GridRow,
  NotificationBanner,
  Tabs,
} from '@fphd/ui';

import { IndicatorHeading } from '../status-tag/indicator-heading.tsx';
import { actionsTabSections } from './actions-tab.ts';
import { ActionsTab } from './actions-tab.tsx';
import type {
  IndicatorAdminDetail,
  NotesForReviewers as Notes,
  OverviewNotification,
  ReviewerNote,
  ReviewerNoteForm,
} from './loader.ts';
import { NotesForReviewers } from './notes-for-reviewers.tsx';
import { REVIEWER_NOTE_FIELD } from './reviewer-notes.ts';
import { ReviewerNotes } from './reviewer-notes.tsx';

const OVERVIEW_TITLE = 'Indicator overview';

interface OverviewProps {
  /** Whether the user may edit it, which the task list is for. */
  canEdit: boolean;
  /** Whether the user is an assigned reviewer of the draft's latest submission. */
  isReviewer?: boolean;
  indicator: IndicatorAdminDetail;
  /** What the publisher wrote for the reviewers, for those who may read it. */
  notesForReviewers?: Notes | null;
  /** The assigned reviewer's own notes and the form for them, for them alone. */
  reviewerNotes?: { notes: readonly ReviewerNote[]; form: ReviewerNoteForm } | null;
  /** What the page the publisher came from left to tell them. */
  notification?: OverviewNotification | undefined;
}

/** The publisher's date is a proposal until an admin confirms it, which schedules the version. */
function PublicationDate({ at, scheduled }: { at: string; scheduled: boolean }) {
  return (
    <p className="govuk-body govuk-!-margin-bottom-6">
      <strong>{scheduled ? 'Scheduled' : 'Proposed'} publication date:</strong>{' '}
      <time dateTime={at}>{formatDate(at, 'longWithTime')}</time>
    </p>
  );
}

export function IndicatorOverviewPage({
  canEdit,
  isReviewer = false,
  indicator,
  notesForReviewers = null,
  reviewerNotes = null,
  notification,
}: OverviewProps) {
  const tabs = [
    {
      id: 'actions',
      label: 'Actions',
      content: (
        <ActionsTab
          sections={actionsTabSections({ canEdit, indicator, isReviewer })}
          reviewerNotes={
            reviewerNotes === null ? null : (
              <ReviewerNotes indicatorId={indicator.id} {...reviewerNotes} />
            )
          }
        />
      ),
    },
    ...(notesForReviewers === null
      ? []
      : [
          {
            id: 'notes-for-reviewers',
            label: 'Notes for reviewers',
            content: <NotesForReviewers notes={notesForReviewers} indicator={indicator} />,
          },
        ]),
  ];

  const noteError = reviewerNotes?.form.fieldErrors.reviewerNote;
  const formError = reviewerNotes?.form.formError;
  const errors = noteError === undefined ? [] : [{ name: REVIEWER_NOTE_FIELD, message: noteError }];

  return (
    <>
      <DocumentTitle
        hasErrors={errors.length > 0 || formError !== undefined}
        pageTitle={OVERVIEW_TITLE}
      />
      <ErrorSummary errors={errors} formError={formError} />
      <GridRow>
        <GridColumn width="two-thirds">
          {notification === undefined ? null : (
            <NotificationBanner
              disableAutoFocus
              {...(notification.type === 'success' ? { type: 'success' } : {})}
              {...(notification.colour === undefined
                ? {}
                : { className: `fphd-notification-banner--${notification.colour}` })}
            >
              {notification.text}
            </NotificationBanner>
          )}
          <IndicatorHeading indicator={indicator}>
            {indicator.draftScheduledPublishAt === null ? null : (
              <PublicationDate
                at={indicator.draftScheduledPublishAt}
                scheduled={indicator.draftStatus === 'scheduled'}
              />
            )}
          </IndicatorHeading>
          <Tabs items={tabs} paramKey="tab" />
        </GridColumn>
      </GridRow>
    </>
  );
}
