import { formatDate, GridColumn, GridRow, NotificationBanner, Tabs } from '@fphd/ui';

import { IndicatorHeading } from '../status-tag/indicator-heading.tsx';
import { actionsTabSections } from './actions-tab.ts';
import { ActionsTab } from './actions-tab.tsx';
import type {
  IndicatorAdminDetail,
  NotesForReviewers as Notes,
  OverviewNotification,
} from './loader.ts';
import { NotesForReviewers } from './notes-for-reviewers.tsx';

interface OverviewProps {
  /** Whether the user may edit it, which the task list is for. */
  canEdit: boolean;
  /** Whether the user is an assigned reviewer of the draft's latest submission. */
  isReviewer?: boolean;
  indicator: IndicatorAdminDetail;
  /** What the publisher wrote for the reviewers, for those who may read it. */
  notesForReviewers?: Notes | null;
  /** What the page the publisher came from left to tell them. */
  notification?: OverviewNotification | undefined;
}

function ScheduledPublicationDate({ at }: { at: string }) {
  return (
    <p className="govuk-body govuk-!-margin-bottom-6">
      <strong>Scheduled publication date:</strong>{' '}
      <time dateTime={at}>{formatDate(at, 'longWithTime')}</time>
    </p>
  );
}

export function IndicatorOverviewPage({
  canEdit,
  isReviewer = false,
  indicator,
  notesForReviewers = null,
  notification,
}: OverviewProps) {
  const tabs = [
    {
      id: 'actions',
      label: 'Actions',
      content: <ActionsTab sections={actionsTabSections({ canEdit, indicator, isReviewer })} />,
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

  return (
    <GridRow>
      <GridColumn width="two-thirds">
        {notification === undefined ? null : (
          <NotificationBanner
            disableAutoFocus
            {...(notification.type === 'success' ? { type: 'success' } : {})}
          >
            {notification.text}
          </NotificationBanner>
        )}
        <IndicatorHeading indicator={indicator}>
          {indicator.draftScheduledPublishAt === null ? null : (
            <ScheduledPublicationDate at={indicator.draftScheduledPublishAt} />
          )}
        </IndicatorHeading>
        <Tabs items={tabs} paramKey="tab" />
      </GridColumn>
    </GridRow>
  );
}
