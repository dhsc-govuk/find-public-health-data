import { Button, GridColumn, GridRow, NotificationBanner, Pagination, Table, Tabs } from '@fphd/ui';
import type { ReactNode } from 'react';
import { NEW_INDICATOR_PATH } from '../publish-paths.ts';
import { INDICATOR_HEADINGS, INDICATOR_KEYS, indicatorCells } from './indicator-cells.tsx';
import type { IndicatorAdminListItem, IndicatorsUnderReview } from './loader.ts';
import type { DashboardNotification } from './notifications.ts';
import {
  ALL_INDICATORS_TAB,
  ALL_OTHER_TAB,
  CREATE_AND_EDIT_TAB,
  type DashboardPageKey,
  type DashboardPages,
  dashboardPath,
  YOUR_TEAMS_TAB,
} from './paths.ts';
import { DashboardSearch } from './search-form.tsx';
import {
  AssignedTable,
  AwaitingDecisionTable,
  ReviewTable,
  ScheduledTable,
  UnassignedTable,
} from './under-review-tables.tsx';

export interface IndicatorList {
  canCreate: boolean;
  indicators: IndicatorAdminListItem[];
  page: number;
  totalPages: number;
}

interface IndicatorListSectionProps extends IndicatorList {
  /** The tab the list is in, which its page links keep open. */
  tab?: string | undefined;
  /** The search the list matches, which its page links keep. */
  search?: string | undefined;
  /** The query parameter its page links set. */
  pageKey?: DashboardPageKey;
  /** The page every list on the dashboard is on, which its page links keep for the others. */
  pages?: DashboardPages;
  /** The list's name, beside another list, which its table and pagination are named by. */
  name?: string | undefined;
}

const NO_MATCHES = 'No indicators match your search.';

const OTHER_LABEL = 'All other indicators';

/** A list's table, or with a search that matched none of its indicators, a message saying so. */
function tableOrNoMatches(search: string | undefined, indicators: unknown[], table: ReactNode) {
  return search !== undefined && indicators.length === 0 ? (
    <p className="govuk-body">{NO_MATCHES}</p>
  ) : (
    table
  );
}

function IndicatorListSection({
  canCreate,
  indicators,
  page,
  totalPages,
  tab,
  search,
  pageKey = 'page',
  pages = {},
  name,
}: IndicatorListSectionProps) {
  // Plain anchors: the router-aware link would also mark every link to the bare path as current.
  const pageLink = (number: number) => ({
    href: dashboardPath({ ...pages, [pageKey]: number }, tab, search),
    forceExternal: true,
    ...(number === page ? { 'aria-current': 'page' as const } : {}),
  });

  return (
    <>
      {canCreate ? <Button href={NEW_INDICATOR_PATH}>Create new indicator</Button> : null}
      {indicators.length === 0 ? (
        <p className="govuk-body">
          {search === undefined ? 'There are no indicators for you to see yet.' : NO_MATCHES}
        </p>
      ) : (
        <Table
          aria-label={`${name ?? 'Indicators'}, most recently edited first`}
          headings={INDICATOR_HEADINGS}
          keys={INDICATOR_KEYS}
          data={indicators.map(indicatorCells)}
        />
      )}
      {totalPages > 1 ? (
        <Pagination
          currentPage={page}
          landmarkLabel={name === undefined ? 'Pagination' : `${name} pagination`}
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
  /** The search every list matches; undefined when the lists are unfiltered. */
  search?: string | undefined;
  underReview: IndicatorsUnderReview | null;
  toReview: IndicatorAdminListItem[] | null;
  /** The approved indicators an admin schedules; null for anyone else. */
  scheduled: IndicatorAdminListItem[] | null;
  /** The submitted updates waiting for an admin's decision; null for anyone else. */
  awaitingDecision: IndicatorAdminListItem[] | null;
  list: IndicatorList | null;
  /** Every other team's indicators, for a publisher whose list holds only their teams'. */
  otherList?: IndicatorList | null;
  /** Something the page the user came from left to tell them. */
  notification?: DashboardNotification | undefined;
}

/** How many of the dashboard's roles the user holds: managing, reviewing, scheduling, the list. */
function roleCount({ underReview, toReview, scheduled, list }: DashboardPageProps) {
  return [underReview, toReview, scheduled, list].filter((role) => role !== null).length;
}

/** The page's h1, which its document title follows; plain "Indicators" without the data. */
export function dashboardHeading(data?: DashboardPageProps): string {
  return data !== undefined && data.list === null && roleCount(data) === 1
    ? 'Indicators under review'
    : 'Indicators';
}

/**
 * The list's tab: Your teams' indicators beside other teams' for a publisher, otherwise Create and
 * edit for someone who may create, or every indicator.
 */
function listTab(list: IndicatorList, beside: boolean) {
  if (beside) return { id: YOUR_TEAMS_TAB, label: "Your teams' indicators" };
  return list.canCreate
    ? { id: CREATE_AND_EDIT_TAB, label: 'Create and edit' }
    : { id: ALL_INDICATORS_TAB, label: 'All indicators' };
}

/** The list's section, and for a publisher the section of every other team's indicators. */
function listSections(
  list: IndicatorList,
  otherList: IndicatorList | null,
  tabbed: boolean,
  search: string | undefined,
) {
  const tab = listTab(list, otherList !== null);
  const pages: DashboardPages =
    otherList === null ? { page: list.page } : { page: list.page, otherPage: otherList.page };
  const name = (label: string) => (otherList === null ? undefined : label);
  return [
    {
      ...tab,
      content: (
        <IndicatorListSection
          {...list}
          tab={tabbed ? tab.id : undefined}
          search={search}
          pages={pages}
          name={name(tab.label)}
        />
      ),
    },
    ...(otherList === null
      ? []
      : [
          {
            id: ALL_OTHER_TAB,
            label: OTHER_LABEL,
            content: (
              <IndicatorListSection
                {...otherList}
                tab={ALL_OTHER_TAB}
                search={search}
                pageKey="otherPage"
                pages={pages}
                name={OTHER_LABEL}
              />
            ),
          },
        ]),
  ];
}

/** An IMRG manager's two sections: the submissions waiting for reviewers, then those in review. */
function underReviewSections(
  { unassigned, assigned }: IndicatorsUnderReview,
  search: string | undefined,
) {
  return [
    {
      id: 'unassigned',
      label: 'Unassigned indicators',
      content: tableOrNoMatches(search, unassigned, <UnassignedTable indicators={unassigned} />),
    },
    {
      id: 'assigned',
      label: 'Assigned indicators',
      content: tableOrNoMatches(search, assigned, <AssignedTable indicators={assigned} />),
    },
  ];
}

/**
 * One section for each table the user may see: Unassigned and Assigned indicators for an IMRG
 * manager, Review for an IMRG reviewer, Scheduled indicators and Update decision needed for an
 * admin, then the indicator list.
 */
function dashboardSections({
  search,
  underReview,
  toReview,
  scheduled,
  awaitingDecision,
  list,
  otherList = null,
}: DashboardPageProps) {
  const sectionsBeforeList = [
    ...(underReview === null ? [] : underReviewSections(underReview, search)),
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
          content: tableOrNoMatches(search, toReview, <ReviewTable indicators={toReview} />),
        },
    scheduled === null
      ? null
      : {
          id: 'scheduled',
          label: countedLabel('Scheduled indicators', scheduled.length),
          content: tableOrNoMatches(search, scheduled, <ScheduledTable indicators={scheduled} />),
        },
    awaitingDecision === null
      ? null
      : {
          id: 'update-decision',
          label: countedLabel('Update decision needed', awaitingDecision.length),
          content: tableOrNoMatches(
            search,
            awaitingDecision,
            <AwaitingDecisionTable indicators={awaitingDecision} />,
          ),
        },
  ].filter((section) => section !== null);

  // The lists come last, so a list is on a tab, and its page links keep that tab open, only when
  // other sections come before it or beside it.
  return list === null
    ? sectionsBeforeList
    : [
        ...sectionsBeforeList,
        ...listSections(
          list,
          otherList,
          sectionsBeforeList.length > 0 || otherList !== null,
          search,
        ),
      ];
}

/**
 * Shows an IMRG manager the indicators under review, an IMRG reviewer the indicators assigned to
 * them, an admin the indicators waiting to be published and every indicator, and a publisher a
 * page of their teams' indicators and a page of every other team's. Each table gets a tab of its
 * own whenever there is more than one. The search above them narrows every table.
 */
export function DashboardPage(props: DashboardPageProps) {
  const sections = dashboardSections(props);
  const tabbed = sections.length > 1;

  return (
    <GridRow>
      <GridColumn width="full">
        {props.notification === undefined ? null : (
          <NotificationBanner
            disableAutoFocus
            {...(props.notification.type === 'success' ? { type: 'success' } : {})}
          >
            {props.notification.text}
          </NotificationBanner>
        )}
        <h1 className="govuk-heading-xl">{dashboardHeading(props)}</h1>
        <DashboardSearch search={props.search} />
        {tabbed ? <Tabs items={sections} paramKey="tab" /> : sections[0]?.content}
      </GridColumn>
    </GridRow>
  );
}
