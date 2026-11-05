import { Button, GridColumn, GridRow, NotificationBanner, Pagination, Table, Tabs } from '@fphd/ui';
import { NEW_INDICATOR_PATH } from '../publish-paths.ts';
import { INDICATOR_HEADINGS, INDICATOR_KEYS, indicatorCells } from './indicator-cells.tsx';
import type { IndicatorAdminListItem, IndicatorsUnderReview } from './loader.ts';
import { ALL_INDICATORS_TAB, CREATE_AND_EDIT_TAB, dashboardPath } from './paths.ts';
import { ReviewTable, ScheduledTable, UnderReviewTables } from './under-review-tables.tsx';

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
  /** The approved indicators an admin schedules; null for anyone else. */
  scheduled: IndicatorAdminListItem[] | null;
  list: IndicatorList | null;
  /** Something the page the user came from left to tell them. */
  notification?: string | undefined;
}

function sectionCount({ underReview, toReview, scheduled, list }: DashboardPageProps) {
  return [underReview, toReview, scheduled, list].filter((section) => section !== null).length;
}

/** The page's h1, which its document title follows; plain "Indicators" without the data. */
export function dashboardHeading(data?: DashboardPageProps): string {
  return data !== undefined && data.list === null && sectionCount(data) === 1
    ? 'Indicators under review'
    : 'Indicators';
}

/** The list's section: Create and edit for someone who may create, otherwise every indicator. */
function listSection(list: IndicatorList, tabbed: boolean) {
  const tab = list.canCreate
    ? { id: CREATE_AND_EDIT_TAB, label: 'Create and edit' }
    : { id: ALL_INDICATORS_TAB, label: 'All indicators' };
  return { ...tab, content: <IndicatorListSection {...list} tab={tabbed ? tab.id : undefined} /> };
}

/**
 * One section for each role the user holds: Assign for an IMRG manager, Review for an IMRG
 * reviewer, Scheduled indicators for an admin, then the indicator list, whose page links keep
 * its tab open when `tabbed`.
 */
function dashboardSections(
  { underReview, toReview, scheduled, list }: DashboardPageProps,
  tabbed: boolean,
) {
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
          // Counts only the indicators waiting for the reviewer, not those sent back for changes.
          label: countedLabel(
            'Review',
            toReview.filter(({ draftSubmissionStatus }) => draftSubmissionStatus === 'in_review')
              .length,
          ),
          content: <ReviewTable indicators={toReview} />,
        },
    scheduled === null
      ? null
      : {
          id: 'scheduled',
          label: countedLabel('Scheduled indicators', scheduled.length),
          content: <ScheduledTable indicators={scheduled} />,
        },
    list === null ? null : listSection(list, tabbed),
  ].filter((section) => section !== null);
}

/**
 * Shows an IMRG manager the indicators under review, an IMRG reviewer the indicators assigned to
 * them, an admin the indicators waiting to be published, and anyone else a page of their
 * indicators. A user with more than one of these gets a tab for each.
 */
export function DashboardPage(props: DashboardPageProps) {
  const tabbed = sectionCount(props) > 1;
  const sections = dashboardSections(props, tabbed);

  return (
    <GridRow>
      <GridColumn width="full">
        {props.notification === undefined ? null : (
          <NotificationBanner disableAutoFocus>{props.notification}</NotificationBanner>
        )}
        <h1 className="govuk-heading-xl">{dashboardHeading(props)}</h1>
        {tabbed ? <Tabs items={sections} paramKey="tab" /> : sections[0]?.content}
      </GridColumn>
    </GridRow>
  );
}
