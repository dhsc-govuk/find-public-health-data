// No @fphd/ui imports here, so the sections unit-test without the components' jsdom.
import {
  type IndicatorAdminDetail,
  REVIEW_RESPONSE_STEPS,
  UPDATE_DECISION_STEPS,
} from '@fphd/internal-api-features/contract';
import { indicatorPath } from '@fphd/utils/indicator-path';

import { reviewResponsePath } from '../indicator-review-response/paths.ts';
import { updateDecisionPath } from '../indicator-update-decision/paths.ts';
import {
  indicatorStartUpdatePath,
  indicatorTaskListPath,
  indicatorWithdrawalPath,
} from '../publish-paths.ts';
import { indicatorAssignReviewersPath, indicatorPublicationDatePath } from './paths.ts';

export interface ActionLink {
  href: string;
  label: string;
}

/** A button: a link styled as one, or a form that posts to `href` when it changes something. */
export interface ActionButton extends ActionLink {
  posts?: true;
}

/** One section of the Actions tab: its heading, a button if it has one, then its links. */
export interface ActionsTabSection {
  heading: 'Review' | 'Actions';
  button: ActionButton | null;
  links: ActionLink[];
}

export interface ActionsTabInput {
  /** Whether the user is an assigned reviewer of the draft's latest submission. */
  isReviewer: boolean;
  /** Whether the user may edit the indicator, which the task list is for. */
  canEdit: boolean;
  indicator: Pick<
    IndicatorAdminDetail,
    | 'id'
    | 'actions'
    | 'indicatorStatus'
    | 'draftStatus'
    | 'draftLocked'
    | 'draftSubmissionStatus'
    | 'draftResponse'
    | 'publishedSlug'
  >;
}

// A response to an update starts by asking whether the update can be published.
function reviewSection({ indicator }: ActionsTabInput): ActionsTabSection {
  const firstPage = indicator.indicatorStatus === 'live' ? 'update-approval' : 'response-type';
  return {
    heading: 'Review',
    button: indicator.actions.some((step) => REVIEW_RESPONSE_STEPS.includes(step))
      ? { href: reviewResponsePath(indicator.id, firstPage), label: 'Submit review response' }
      : null,
    links: [],
  };
}

/**
 * The publisher's next step once a round sends the draft back, worded by what it asked for. An
 * update asks for revisions the same way whoever sent it back.
 */
function respondLabel({ indicatorStatus, draftResponse }: ActionsTabInput['indicator']): string {
  if (draftResponse?.flaggedTaskCount === 0) return 'Respond to clarification request';
  if (indicatorStatus === 'live') return 'Respond to requested revisions';
  return draftResponse?.kind === 'pre_imrg_feedback'
    ? 'Respond to advised revisions'
    : 'Respond to requested revision';
}

/** The IMRG manager's wording, which names an update as one. */
function assignLabels({ indicatorStatus }: ActionsTabInput['indicator']) {
  return indicatorStatus === 'live'
    ? { assign: 'Assign reviewer to update', change: 'Change reviewer for this update' }
    : { assign: 'Assign reviewers to indicator', change: 'Change reviewers for this indicator' };
}

/**
 * The section's one button, if it has one. An editor starts an update of a live indicator with no
 * draft, or responds from the task list once a round sends the draft back. An IMRG manager assigns
 * the first reviewers. An admin decides what happens to a submitted update, and confirms an
 * approved draft's publication date.
 */
function actionsButton(
  { canEdit, indicator }: ActionsTabInput,
  { assignFirst, responds }: { assignFirst: boolean; responds: boolean },
): ActionButton | null {
  if (canEdit && indicator.indicatorStatus === 'live' && indicator.draftStatus === null) {
    return { href: indicatorStartUpdatePath(indicator.id), label: 'Update indicator', posts: true };
  }
  if (assignFirst) {
    return {
      href: indicatorAssignReviewersPath(indicator.id),
      label: assignLabels(indicator).assign,
    };
  }
  if (responds) {
    return {
      href: indicatorTaskListPath(indicator.id),
      label: respondLabel(indicator),
    };
  }
  if (indicator.actions.some((step) => UPDATE_DECISION_STEPS.includes(step))) {
    return { href: updateDecisionPath(indicator.id), label: 'Submit update decision' };
  }
  if (indicator.actions.includes('schedule')) {
    return { href: indicatorPublicationDatePath(indicator.id), label: 'Confirm publication date' };
  }
  return null;
}

// An editor continues from the task list while the draft is unlocked, and withdraws what the
// workflow lets them; an IMRG manager changes the reviewers once assigned; an admin changes a
// confirmed publication date.
function actionsSection(input: ActionsTabInput): ActionsTabSection {
  const { canEdit, indicator } = input;
  const mayAssign = indicator.actions.includes('assign_reviewers');
  const assignFirst = mayAssign && indicator.draftSubmissionStatus === 'submitted';
  const editable = canEdit && indicator.draftStatus !== null && !indicator.draftLocked;
  const responds = editable && indicator.draftSubmissionStatus === 'changes_requested';
  const links = [
    !editable || responds
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
          label: assignLabels(indicator).change,
        }
      : undefined,
    indicator.actions.includes('change_publication_date')
      ? { href: indicatorPublicationDatePath(indicator.id), label: 'Change publication date' }
      : undefined,
  ].filter((link) => link !== undefined);

  return { heading: 'Actions', button: actionsButton(input, { assignFirst, responds }), links };
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
      : [{ href: indicatorPath(publishedSlug), label: 'View live indicator' }];
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
