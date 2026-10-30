import { A, Button, formatDate, GridColumn, GridRow, NotificationBanner, Tabs } from '@fphd/ui';
import { indicatorPath } from '@fphd/utils/indicator-path';

import { indicatorTaskListPath, indicatorWithdrawalPath } from '../publish-paths.ts';
import { IndicatorHeading } from '../status-tag/indicator-heading.tsx';
import type {
  IndicatorAdminDetail,
  NotesForReviewers as Notes,
  OverviewNotification,
} from './loader.ts';
import { NotesForReviewers } from './notes-for-reviewers.tsx';
import { indicatorAssignReviewersPath } from './paths.ts';

interface ActionsProps {
  /** Whether the user may edit it, which the task list is for. */
  canEdit: boolean;
  indicator: IndicatorAdminDetail;
}

interface OverviewProps extends ActionsProps {
  /** What the publisher wrote for the reviewers, for those who may read it. */
  notesForReviewers?: Notes | null;
  /** What the page the publisher came from left to tell them. */
  notification?: OverviewNotification | undefined;
}

// A draft is edited from its task list, unless it is locked for review; an indicator with a
// published version has a public page, draft or not. Reviewers are first assigned with a button.
function Actions({ canEdit, indicator }: ActionsProps) {
  const mayAssign = indicator.actions.includes('assign_reviewers');
  const assignFirst = mayAssign && indicator.draftSubmissionStatus === 'submitted';
  const actions = [
    !canEdit || indicator.draftStatus === null || indicator.draftLocked
      ? undefined
      : {
          href: indicatorTaskListPath(indicator.id),
          label:
            indicator.indicatorStatus === 'live'
              ? 'Continue updating indicator'
              : 'Continue creating indicator',
        },
    indicator.actions.includes('withdraw')
      ? { href: indicatorWithdrawalPath(indicator.id), label: 'Withdraw submission' }
      : undefined,
    mayAssign && !assignFirst
      ? {
          href: indicatorAssignReviewersPath(indicator.id),
          label: 'Change reviewers for this indicator',
        }
      : undefined,
    indicator.publishedSlug === null
      ? undefined
      : {
          href: indicatorPath(indicator.publishedSlug),
          label: 'View published indicator',
        },
  ].filter((action) => action !== undefined);

  return (
    <>
      <h2 className="govuk-heading-m">Actions</h2>
      {assignFirst ? (
        <Button href={indicatorAssignReviewersPath(indicator.id)}>
          Assign reviewers to indicator
        </Button>
      ) : null}
      {actions.length > 0 ? (
        <ul className="govuk-list">
          {actions.map(({ href, label }) => (
            <li key={href}>
              <A href={href}>{label}</A>
            </li>
          ))}
        </ul>
      ) : null}
      {actions.length === 0 && !assignFirst ? (
        <p className="govuk-body">There are no actions available for this indicator yet.</p>
      ) : null}
    </>
  );
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
  indicator,
  notesForReviewers = null,
  notification,
}: OverviewProps) {
  const tabs = [
    {
      id: 'actions',
      label: 'Actions',
      content: <Actions canEdit={canEdit} indicator={indicator} />,
    },
    ...(notesForReviewers === null
      ? []
      : [
          {
            id: 'notes-for-reviewers',
            label: 'Notes for reviewers',
            content: <NotesForReviewers notes={notesForReviewers} />,
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
