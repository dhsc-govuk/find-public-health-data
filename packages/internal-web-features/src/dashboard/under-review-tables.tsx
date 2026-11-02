import { Table } from '@fphd/ui';
import { INDICATOR_HEADINGS, INDICATOR_KEYS, indicatorCells } from './indicator-cells.tsx';
import type { IndicatorAdminListItem, IndicatorsUnderReview } from './loader.ts';

const ASSIGNED_HEADINGS = { ...INDICATOR_HEADINGS, reviewers: 'Assigned reviewers' };

const ASSIGNED_KEYS: (keyof typeof ASSIGNED_HEADINGS)[] = [
  'name',
  'reviewers',
  ...INDICATOR_KEYS.slice(1),
];

function assignedCells(indicator: IndicatorAdminListItem) {
  return {
    ...indicatorCells(indicator),
    reviewers: (
      <ul className="govuk-list govuk-!-margin-bottom-0">
        {indicator.draftReviewers.map((reviewer) => (
          <li key={reviewer.id}>{reviewer.name}</li>
        ))}
      </ul>
    ),
  };
}

/** The submissions waiting for reviewers, then those in review, each oldest first. */
export function UnderReviewTables({ unassigned, assigned }: IndicatorsUnderReview) {
  return (
    <>
      <h2 className="govuk-heading-m">Unassigned indicators</h2>
      {unassigned.length === 0 ? (
        <p className="govuk-body govuk-!-margin-bottom-8">No unassigned indicators</p>
      ) : (
        <Table
          aria-label="Unassigned indicators, oldest submission first"
          className="govuk-!-margin-bottom-8"
          headings={INDICATOR_HEADINGS}
          keys={INDICATOR_KEYS}
          data={unassigned.map(indicatorCells)}
        />
      )}
      <h2 className="govuk-heading-m">Assigned indicators</h2>
      {assigned.length === 0 ? (
        <p className="govuk-body">No assigned indicators</p>
      ) : (
        <Table
          aria-label="Assigned indicators, oldest submission first"
          headings={ASSIGNED_HEADINGS}
          keys={ASSIGNED_KEYS}
          data={assigned.map(assignedCells)}
        />
      )}
    </>
  );
}

/** The submissions in review assigned to the reviewer, oldest first. */
export function ReviewTable({ indicators }: { indicators: IndicatorAdminListItem[] }) {
  return indicators.length === 0 ? (
    <p className="govuk-body">No assigned indicators under review</p>
  ) : (
    <Table
      aria-label="Indicators to review, oldest submission first"
      headings={ASSIGNED_HEADINGS}
      keys={ASSIGNED_KEYS}
      data={indicators.map(assignedCells)}
    />
  );
}
