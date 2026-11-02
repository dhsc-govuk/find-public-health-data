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
  tab?: string | undefined;
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

function sectionCount({ underReview, toReview, list }: DashboardPageProps): number {
  return [underReview, toReview, list].filter((section) => section !== null).length;
}

/** The page's h1, which its document title follows; plain "Indicators" without the data. */
export function dashboardHeading(data?: DashboardPageProps): string {
  return data !== undefined && data.list === null && sectionCount(data) === 1
    ? 'Indicators under review'
    : 'Indicators';
}

/**
 * One section for each role the user holds: Assign for an IMRG manager, Review for an IMRG
 * reviewer, then the indicator list. `listTab` is the list's tab, which its page links keep open.
 */
function dashboardSections({ underReview, toReview, list }: DashboardPageProps, listTab?: string) {
  return [
    underReview === null
      ? null
      : {
          id: 'assign',
          label: countedLabel('Assign', underReview.unassigned.length),
          content: <UnderReviewTables {...underReview} />,
        },
    toReview === null
      ? null
      : {
          id: 'review',
          label: countedLabel('Review', toReview.length),
          content: <ReviewTable indicators={toReview} />,
        },
    list === null
      ? null
      : {
          id: CREATE_AND_EDIT_TAB,
          label: 'Create and edit',
          content: <IndicatorListSection {...list} tab={listTab} />,
        },
  ].filter((section) => section !== null);
}

/**
 * Shows an IMRG manager the indicators under review, an IMRG reviewer the indicators assigned to
 * them, and anyone else a page of their indicators. A user with more than one of these gets a tab
 * for each.
 */
export function DashboardPage(props: DashboardPageProps) {
  const tabbed = sectionCount(props) > 1;
  const sections = dashboardSections(props, tabbed ? CREATE_AND_EDIT_TAB : undefined);

  return (
    <GridRow>
      <GridColumn width="full">
        <h1 className="govuk-heading-xl">{dashboardHeading(props)}</h1>
        {tabbed ? <Tabs items={sections} paramKey="tab" /> : sections[0]?.content}
      </GridColumn>
    </GridRow>
  );
}
