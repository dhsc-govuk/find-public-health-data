import { Table } from '@fphd/ui';
import { INDICATOR_HEADINGS, INDICATOR_KEYS, indicatorCells } from './indicator-cells.tsx';
import type { IndicatorAdminListItem } from './loader.ts';

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

/** The submissions waiting for reviewers, oldest first. */
export function UnassignedTable({ indicators }: { indicators: IndicatorAdminListItem[] }) {
  return indicators.length === 0 ? (
    <p className="govuk-body">No unassigned indicators</p>
  ) : (
    <Table
      aria-label="Unassigned indicators, oldest submission first"
      headings={INDICATOR_HEADINGS}
      keys={INDICATOR_KEYS}
      data={indicators.map(indicatorCells)}
    />
  );
}

/** The submissions in review, with their reviewers, oldest first. */
export function AssignedTable({ indicators }: { indicators: IndicatorAdminListItem[] }) {
  return indicators.length === 0 ? (
    <p className="govuk-body">No assigned indicators</p>
  ) : (
    <Table
      aria-label="Assigned indicators, oldest submission first"
      headings={ASSIGNED_HEADINGS}
      keys={ASSIGNED_KEYS}
      data={indicators.map(assignedCells)}
    />
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

/** The approved indicators waiting to be published, soonest publication date first. */
export function ScheduledTable({ indicators }: { indicators: IndicatorAdminListItem[] }) {
  return indicators.length === 0 ? (
    <p className="govuk-body">There are no scheduled indicators.</p>
  ) : (
    <Table
      aria-label="Scheduled indicators, soonest publication date first"
      headings={INDICATOR_HEADINGS}
      keys={INDICATOR_KEYS}
      data={indicators.map(indicatorCells)}
    />
  );
}

/** The submitted updates waiting for the core team's decision, oldest first. */
export function AwaitingDecisionTable({ indicators }: { indicators: IndicatorAdminListItem[] }) {
  return indicators.length === 0 ? (
    <p className="govuk-body">There are no updates waiting for a decision.</p>
  ) : (
    <Table
      aria-label="Updates waiting for a decision, oldest submission first"
      headings={INDICATOR_HEADINGS}
      keys={INDICATOR_KEYS}
      data={indicators.map(indicatorCells)}
    />
  );
}
