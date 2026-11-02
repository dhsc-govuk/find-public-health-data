// No @fphd/ui imports here, so the sections unit-test without the components' jsdom.
import type { IndicatorAdminDetail, IndicatorStep } from '@fphd/internal-api-features/contract';
import { indicatorPath } from '@fphd/utils/indicator-path';

import { reviewResponsePath } from '../indicator-review-response/paths.ts';
import { indicatorTaskListPath, indicatorWithdrawalPath } from '../publish-paths.ts';
import { indicatorAssignReviewersPath } from './paths.ts';

export interface ActionLink {
  href: string;
  label: string;
}

/** One section of the Actions tab: its heading, a button if it has one, then its links. */
export interface ActionsTabSection {
  heading: 'Review' | 'Actions';
  button: ActionLink | null;
  links: ActionLink[];
}

/** The steps a reviewer's response takes, any of which the Review section's button offers. */
export const RESPONSE_STEPS: readonly IndicatorStep[] = [
  'give_feedback',
  'request_changes',
  'approve',
];

export interface ActionsTabInput {
  /** Whether the user is an assigned reviewer of the draft's latest submission. */
  isReviewer: boolean;
  /** Whether the user may edit the indicator, which the task list is for. */
  canEdit: boolean;
  indicator: Pick<
    IndicatorAdminDetail,
    'id' | 'actions' | 'indicatorStatus' | 'draftStatus' | 'draftLocked' | 'draftSubmissionStatus'
  > &
    Pick<IndicatorAdminDetail, 'publishedSlug'>;
}

function reviewSection({ indicator }: ActionsTabInput): ActionsTabSection {
  const responds = indicator.actions.some((step) => RESPONSE_STEPS.includes(step));
  return {
    heading: 'Review',
    button: responds
      ? { href: reviewResponsePath(indicator.id, 'response-type'), label: 'Submit review response' }
      : null,
    links: [],
  };
}

// An editor continues from the task list while the draft is unlocked and withdraws what the
// workflow lets them; an IMRG manager assigns the first reviewers with a button, then changes them.
function actionsSection({ canEdit, indicator }: ActionsTabInput): ActionsTabSection {
  const mayAssign = indicator.actions.includes('assign_reviewers');
  const assignFirst = mayAssign && indicator.draftSubmissionStatus === 'submitted';
  const links = [
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
  ].filter((link) => link !== undefined);

  return {
    heading: 'Actions',
    button: assignFirst
      ? {
          href: indicatorAssignReviewersPath(indicator.id),
          label: 'Assign reviewers to indicator',
        }
      : null,
    links,
  };
}

/**
 * The Actions tab's sections, decided by what the user is to the indicator: Review for an
 * assigned reviewer, then Actions while it offers them something, or always when there is no
 * Review section. The view links, the same for everyone, go first in the first section.
 */
export function actionsTabSections(input: ActionsTabInput): ActionsTabSection[] {
  const { publishedSlug } = input.indicator;
  const viewLinks =
    publishedSlug === null
      ? []
      : [{ href: indicatorPath(publishedSlug), label: 'View published indicator' }];
  const review = input.isReviewer ? reviewSection(input) : null;
  const actions = actionsSection(input);
  const offersActions = actions.button !== null || actions.links.length > 0;
  const sections = [review, offersActions || review === null ? actions : null].filter(
    (section) => section !== null,
  );

  return sections.map((section, index) =>
    index === 0 ? { ...section, links: [...viewLinks, ...section.links] } : section,
  );
}
