import type { IndicatorAdminDetail } from '@fphd/internal-api-features/contract';
import type { ReactNode } from 'react';

import { StatusTag } from './status-tag.tsx';

type HeadedIndicator = Pick<
  IndicatorAdminDetail,
  'name' | 'shortId' | 'indicatorStatus' | 'draftStatus' | 'draftSubmissionStatus'
>;

interface IndicatorHeadingProps {
  indicator: HeadedIndicator;
  /** Lines under the statuses, which then sit closer to them. */
  children?: ReactNode;
}

/** How a publisher's pages title an indicator: its name, its public number, then its statuses. */
export function IndicatorHeading({ indicator, children }: IndicatorHeadingProps) {
  const { draftStatus, draftSubmissionStatus, indicatorStatus, name, shortId } = indicator;

  return (
    <>
      <h1 className="govuk-heading-xl govuk-!-margin-bottom-2">{name}</h1>
      <p className="govuk-heading-m govuk-!-margin-bottom-2">ID: {shortId}</p>
      <p className={children ? 'govuk-!-margin-bottom-2' : 'govuk-!-margin-bottom-6'}>
        <StatusTag type="indicator" status={indicatorStatus} />{' '}
        <StatusTag
          type="publishing"
          indicatorStatus={indicatorStatus}
          draftStatus={draftStatus}
          draftSubmissionStatus={draftSubmissionStatus}
        />
      </p>
      {children}
    </>
  );
}
