import type { IndicatorTaskStatuses } from '@fphd/internal-api-features/contract';
import { A, Markdown } from '@fphd/ui';
import type { ReactNode } from 'react';

import type { TaskGroup } from '../indicator-tasks.ts';
import { indicatorRevisionResponsePath } from '../publish-paths.ts';
import { StatusTag } from '../status-tag/status-tag.tsx';
import type { ReviewerRequest, ReviewerRequests } from './loader.ts';

interface Row {
  key: string;
  title: string;
  href: string;
  request: ReactNode;
  status: ReactNode;
}

function RequestRow({ title, href, request, status }: Row) {
  return (
    <tr className="govuk-table__row">
      <td className="govuk-table__cell">
        <A href={href}>{title}</A>
      </td>
      <td className="govuk-table__cell">{request}</td>
      <td className="govuk-table__cell fphd-task-table__status">{status}</td>
    </tr>
  );
}

function flagOf(requests: ReviewerRequests, key: string): ReviewerRequest | undefined {
  return (requests.flags as Partial<Record<string, ReviewerRequest>>)[key];
}

interface ReviewTaskTableProps {
  id: string;
  group: TaskGroup;
  tasks: IndicatorTaskStatuses;
  requests: ReviewerRequests;
}

/**
 * One group of the task list while a round of review has sent the draft back: each task with
 * what the reviewer asked of it and its status, a flagged task tagged until it is saved. The
 * notes for reviewers end with the publisher's reply to the round, as the prototype has it.
 */
export function ReviewTaskTable({ id, group, tasks, requests }: ReviewTaskTableProps) {
  const headingId = `${group.id}-heading`;
  const rows: Row[] = group.tasks.map(({ key, title, path }) => {
    const flag = flagOf(requests, key);
    return {
      key,
      title,
      href: path(id, tasks[key]),
      request: flag === undefined ? null : <Markdown html={flag.notes} />,
      status:
        flag === undefined || flag.cleared ? (
          <StatusTag type="task" status={tasks[key]} />
        ) : (
          <StatusTag type="revision" status={requests.advised ? 'advised' : 'needed'} />
        ),
    };
  });
  const reply: Row = {
    key: 'revision-response',
    title: 'Response to revisions or clarifications',
    href: indicatorRevisionResponsePath(id),
    request:
      requests.clarificationRequest === null ? null : (
        <Markdown html={requests.clarificationRequest} />
      ),
    status: <StatusTag type="task" status={requests.replied ? 'completed' : 'not_started'} />,
  };

  return (
    <>
      <h2 className="govuk-heading-m" id={headingId}>
        {group.title}
      </h2>
      <table aria-labelledby={headingId} className="govuk-table fphd-task-table">
        <thead className="govuk-table__head">
          <tr className="govuk-table__row">
            <th className="govuk-table__header govuk-!-width-one-third" scope="col">
              Task
            </th>
            <th className="govuk-table__header" scope="col">
              Reviewer requests
            </th>
            <th className="govuk-table__header fphd-task-table__status" scope="col">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="govuk-table__body">
          {(group.id === 'reviewer-notes' ? [...rows, reply] : rows).map((row) => (
            <RequestRow {...row} key={row.key} />
          ))}
        </tbody>
      </table>
    </>
  );
}
