import type { IndicatorStep } from '@fphd/internal-api-features/contract';
import { describe, expect, it } from 'vitest';

import { type ActionsTabInput, actionsTabSections } from './actions-tab.ts';

const ID = '019a1b2c-3d4e-7f60-8a9b-0c1d2e3f4a5b';
const RESPOND: IndicatorStep[] = ['give_feedback', 'request_changes', 'approve'];

const respond = {
  href: `/dashboard/indicators/${ID}/review/response-type`,
  label: 'Submit review response',
};
const viewPublished = { href: '/indicator/hip-fractures', label: 'View published indicator' };
const continueCreating = {
  href: `/publish/indicators/${ID}/task-list`,
  label: 'Continue creating indicator',
};
const withdraw = {
  href: `/publish/indicators/${ID}/withdraw-submission`,
  label: 'Withdraw submission',
};
const assignFirst = {
  href: `/dashboard/indicators/${ID}/assign-reviewers`,
  label: 'Assign reviewers to indicator',
};
const changeReviewers = {
  href: `/dashboard/indicators/${ID}/assign-reviewers`,
  label: 'Change reviewers for this indicator',
};

type State = ActionsTabInput['indicator'];

const newDraft: State = {
  id: ID,
  actions: [],
  indicatorStatus: 'new',
  draftStatus: 'draft',
  draftLocked: false,
  draftSubmissionStatus: null,
  publishedSlug: null,
};
const submitted: State = { ...newDraft, draftLocked: true, draftSubmissionStatus: 'submitted' };
const inReview: State = { ...submitted, draftSubmissionStatus: 'in_review' };
const sentBack: State = { ...newDraft, draftSubmissionStatus: 'changes_requested' };
const approved: State = { ...submitted, draftSubmissionStatus: 'approved' };
const live: State = {
  ...newDraft,
  indicatorStatus: 'live',
  draftStatus: null,
  publishedSlug: 'hip-fractures',
};

function sections(indicator: State, { isReviewer = false, canEdit = false } = {}) {
  return actionsTabSections({ indicator, isReviewer, canEdit });
}

describe('actionsTabSections', () => {
  describe('for an assigned reviewer who does nothing else', () => {
    it('offers the response in a Review section alone, while the round waits for one', () => {
      expect(sections({ ...inReview, actions: RESPOND }, { isReviewer: true })).toEqual([
        { heading: 'Review', button: respond, links: [] },
      ]);
    });

    it('keeps the Review section, without the button, once a response is sent', () => {
      expect(sections(sentBack, { isReviewer: true })).toEqual([
        { heading: 'Review', button: null, links: [] },
      ]);
      expect(sections(approved, { isReviewer: true })).toEqual([
        { heading: 'Review', button: null, links: [] },
      ]);
    });

    it('puts the published page under the Review section', () => {
      expect(sections({ ...live, actions: RESPOND }, { isReviewer: true })).toEqual([
        { heading: 'Review', button: respond, links: [viewPublished] },
      ]);
    });
  });

  describe('for a publisher who is also an assigned reviewer', () => {
    it('offers the response, then the withdrawal the workflow allows them', () => {
      expect(
        sections(
          { ...inReview, actions: ['withdraw', ...RESPOND] },
          { isReviewer: true, canEdit: true },
        ),
      ).toEqual([
        { heading: 'Review', button: respond, links: [] },
        { heading: 'Actions', button: null, links: [withdraw] },
      ]);
    });

    it('shows only the Review section while the draft is locked and they have nothing to do', () => {
      expect(sections(approved, { isReviewer: true, canEdit: true })).toEqual([
        { heading: 'Review', button: null, links: [] },
      ]);
    });

    it('offers the task list in the Actions section once the draft is sent back', () => {
      expect(
        sections({ ...sentBack, actions: ['resubmit'] }, { isReviewer: true, canEdit: true }),
      ).toEqual([
        { heading: 'Review', button: null, links: [] },
        { heading: 'Actions', button: null, links: [continueCreating] },
      ]);
    });
  });

  describe('for an IMRG manager', () => {
    it('offers a button to assign the first reviewers', () => {
      expect(sections({ ...submitted, actions: ['assign_reviewers'] })).toEqual([
        { heading: 'Actions', button: assignFirst, links: [] },
      ]);
    });

    it('offers a link to change them while in review', () => {
      expect(sections({ ...inReview, actions: ['assign_reviewers'] })).toEqual([
        { heading: 'Actions', button: null, links: [changeReviewers] },
      ]);
    });

    it('keeps an empty Actions section once the round is answered', () => {
      expect(sections(approved)).toEqual([{ heading: 'Actions', button: null, links: [] }]);
    });

    it('gives a manager who is an assigned reviewer both sections, Review first', () => {
      expect(
        sections({ ...inReview, actions: ['assign_reviewers', ...RESPOND] }, { isReviewer: true }),
      ).toEqual([
        { heading: 'Review', button: respond, links: [] },
        { heading: 'Actions', button: null, links: [changeReviewers] },
      ]);
    });
  });

  describe('for anyone with no section of their own, such as an admin', () => {
    it('keeps an empty Actions section for a new indicator', () => {
      expect(sections(newDraft)).toEqual([{ heading: 'Actions', button: null, links: [] }]);
    });

    it('holds the published page in the Actions section for a live indicator', () => {
      expect(sections(live)).toEqual([
        { heading: 'Actions', button: null, links: [viewPublished] },
      ]);
    });
  });

  describe('for a publisher', () => {
    it('lists the published page before the task list', () => {
      expect(
        sections({ ...live, draftStatus: 'draft' }, { canEdit: true }).map(({ links }) => links),
      ).toEqual([[viewPublished, { ...continueCreating, label: 'Continue updating indicator' }]]);
    });

    it('offers the withdrawal of a submission in review', () => {
      expect(sections({ ...inReview, actions: ['withdraw'] }, { canEdit: true })).toEqual([
        { heading: 'Actions', button: null, links: [withdraw] },
      ]);
    });
  });
});
