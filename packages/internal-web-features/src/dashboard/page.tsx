import { Button, GridColumn, GridRow, Pagination, Table, Tabs } from '@fphd/ui';
import { NEW_INDICATOR_PATH } from '../publish-paths.ts';
import { INDICATOR_HEADINGS, INDICATOR_KEYS, indicatorCells } from './indicator-cells.tsx';
import type { IndicatorAdminListItem, IndicatorsUnderReview } from './loader.ts';
import { CREATE_AND_EDIT_TAB, dashboardPath } from './paths.ts';
import { ReviewTable, UnderReviewTables } from './under-review-tables.tsx';

export interface IndicatorList {
  canCreate: boolean;
  indicators: IndicatorAdminListItem[];
  page: number;
  totalPages: number;
}

interface IndicatorListSectionProps extends IndicatorList {
  /** The tab the list is in, which its page links keep open. */
  tab?: string;
}

function IndicatorListSection({
  canCreate,
  indicators,
  page,
  totalPages,
  tab,
}: IndicatorListSectionProps) {
  // Plain anchors: the router-aware link would also mark every link to the bare path as current.
  const pageLink = (number: number) => ({
    href: dashboardPath(number, tab),
    forceExternal: true,
    ...(number === page ? { 'aria-current': 'page' as const } : {}),
  });

  return (
    <>
      {canCreate ? <Button href={NEW_INDICATOR_PATH}>Create new indicator</Button> : null}
      {indicators.length === 0 ? (
        <p className="govuk-body">There are no indicators for you to see yet.</p>
      ) : (
        <Table
          aria-label="Indicators, most recently edited first"
          headings={INDICATOR_HEADINGS}
          keys={INDICATOR_KEYS}
          data={indicators.map(indicatorCells)}
        />
      )}
      {totalPages > 1 ? (
        <Pagination
          currentPage={page}
          landmarkLabel="Pagination"
          links={Array.from({ length: totalPages }, (_, index) => pageLink(index + 1))}
        />
      ) : null}
    </>
  );
}

function countedLabel(label: string, count: number): string {
  return count > 0 ? `${label} (${count})` : label;
}

interface DashboardPageProps {
  underReview: IndicatorsUnderReview | null;
  toReview: IndicatorAdminListItem[] | null;
  list: IndicatorList | null;
}

/** The page's h1, which its document title follows; plain "Indicators" without the data. */
export function dashboardHeading(data?: DashboardPageProps): string {
  return data !== undefined &&
    data.list === null &&
    (data.underReview !== null || data.toReview !== null)
    ? 'Indicators under review'
    : 'Indicators';
}

/** The indicators an IMRG manager or reviewer works on as such, with the tab that holds them. */
function reviewSection({ underReview, toReview }: DashboardPageProps) {
  if (underReview !== null) {
    return {
      id: 'assign',
      label: countedLabel('Assign', underReview.unassigned.length),
      content: <UnderReviewTables {...underReview} />,
    };
  }

  if (toReview !== null) {
    return {
      id: 'review',
      label: countedLabel('Review', toReview.length),
      content: <ReviewTable indicators={toReview} />,
    };
  }

  return null;
}

/**
 * The indicators under review for an IMRG manager, those assigned to an IMRG reviewer, a page of
 * indicators for anyone else, and a tab of each for a manager or reviewer who also publishes.
 */
export function DashboardPage(props: DashboardPageProps) {
  const { list } = props;
  const review = reviewSection(props);

  if (review !== null && list !== null) {
    return (
      <GridRow>
        <GridColumn width="full">
          <h1 className="govuk-heading-xl">{dashboardHeading(props)}</h1>
          <Tabs
            items={[
              review,
              {
                id: CREATE_AND_EDIT_TAB,
                label: 'Create and edit',
                content: <IndicatorListSection {...list} tab={CREATE_AND_EDIT_TAB} />,
              },
            ]}
            paramKey="tab"
          />
        </GridColumn>
      </GridRow>
    );
  }

  return (
    <GridRow>
      <GridColumn width="full">
        <h1 className="govuk-heading-xl">{dashboardHeading(props)}</h1>
        {review?.content}
        {list !== null ? <IndicatorListSection {...list} /> : null}
      </GridColumn>
    </GridRow>
  );
}
