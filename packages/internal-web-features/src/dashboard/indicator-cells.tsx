import { A, formatDate } from '@fphd/ui';
import { indicatorOverviewPath } from '../indicator-overview/paths.ts';
import { StatusTag } from '../status-tag/status-tag.tsx';
import type { IndicatorAdminListItem } from './loader.ts';

/** The dashboard's columns, which every table of indicators on it shows. */
export const INDICATOR_HEADINGS = {
  name: 'Indicator name',
  teamName: 'Team',
  createdBy: 'Created by',
  updatedAt: 'Last edited',
  lastEditedBy: 'Last edited by',
  indicatorStatus: 'Indicator status',
  publishingStatus: 'Publishing status',
};

export const INDICATOR_KEYS: (keyof typeof INDICATOR_HEADINGS)[] = [
  'name',
  'teamName',
  'createdBy',
  'updatedAt',
  'lastEditedBy',
  'indicatorStatus',
  'publishingStatus',
];

export function indicatorCells(indicator: IndicatorAdminListItem) {
  return {
    // The first column is a row header, which GOV.UK sets bold; the names read as plain text.
    name: (
      <span className="govuk-!-font-weight-regular">
        <A href={indicatorOverviewPath(indicator.id)}>{indicator.name}</A>
      </span>
    ),
    teamName: indicator.teamName,
    createdBy: indicator.createdBy,
    updatedAt: <time dateTime={indicator.updatedAt}>{formatDate(indicator.updatedAt)}</time>,
    lastEditedBy: indicator.lastEditedBy,
    // The column headers name the statuses, and screen readers announce them per cell.
    indicatorStatus: (
      <StatusTag type="indicator" status={indicator.indicatorStatus} labelled={false} />
    ),
    publishingStatus: (
      <StatusTag
        type="publishing"
        indicatorStatus={indicator.indicatorStatus}
        draftStatus={indicator.draftStatus}
        draftSubmissionStatus={indicator.draftSubmissionStatus}
        draftResponseKind={indicator.draftResponseKind}
        labelled={false}
      />
    ),
  };
}
