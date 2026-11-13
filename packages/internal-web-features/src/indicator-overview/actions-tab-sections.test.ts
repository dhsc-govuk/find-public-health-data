import type { IndicatorStep } from '@fphd/internal-api-features/contract';
import { describe, expect, it } from 'vitest';

import { type ActionsTabInput, actionsTabSections } from './actions-tab-sections.ts';

const ID = '019a1b2c-3d4e-7f60-8a9b-0c1d2e3f4a5b';
const RESPOND: IndicatorStep[] = ['give_feedback', 'request_changes', 'approve'];

const respond = {
  href: `/dashboard/indicators/${ID}/review/response-type`,
  label: 'Submit review response',
};
const viewLive = { href: '/indicator/hip-fractures', label: 'View live indicator' };
const continueCreating = {
  href: `/publish/indicators/${ID}/task-list`,
  label: 'Continue creating indicator',
};
const respondToRevision = {
  href: `/publish/indicators/${ID}/task-list`,
  label: 'Respond to requested revision',
};
const startUpdate = {
  href: `/publish/indicators/${ID}/start-update`,
  label: 'Update indicator',
  posts: true,
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

const confirmDate = {
  href: `/dashboard/indicators/${ID}/publication-date`,
  label: 'Confirm publication date',
};
const changeDate = {
  href: `/dashboard/indicators/${ID}/publication-date`,
  label: 'Change publication date',
};

type State = ActionsTabInput['indicator'];

const newDraft: State = {
  id: ID,
  actions: [],
  indicatorStatus: 'new',
  draftStatus: 'draft',
  draftLocked: false,
  draftSubmissionStatus: null,
  draftResponse: null,
  publishedSlug: null,
};
const submitted: State = { ...newDraft, draftLocked: true, draftSubmissionStatus: 'submitted' };
const inReview: State = { ...submitted, draftSubmissionStatus: 'in_review' };
const sentBack: State = {
  ...newDraft,
  draftSubmissionStatus: 'changes_requested',
  draftResponse: { kind: 'minor_revisions', flaggedTaskCount: 1 },
};
const approved: State = { ...submitted, draftSubmissionStatus: 'approved' };
const scheduled: State = { ...approved, draftStatus: 'scheduled' };
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

    it('puts the live page under the Review section', () => {
      expect(sections({ ...live, actions: RESPOND }, { isReviewer: true })).toEqual([
        { heading: 'Review', button: respond, links: [viewLive] },
      ]);
    });
  });

  describe('for a publisher who is also an assigned reviewer', () => {
    it('offers the response alone while the draft is in review', () => {
      expect(
        sections({ ...inReview, actions: RESPOND }, { isReviewer: true, canEdit: true }),
      ).toEqual([{ heading: 'Review', button: respond, links: [] }]);
    });

    it('shows only the Review section while the draft is locked and they have nothing to do', () => {
      expect(sections(approved, { isReviewer: true, canEdit: true })).toEqual([
        { heading: 'Review', button: null, links: [] },
      ]);
    });

    it('offers the response to the revisions in the Actions section once the draft is sent back', () => {
      expect(
        sections({ ...sentBack, actions: ['resubmit'] }, { isReviewer: true, canEdit: true }),
      ).toEqual([
        { heading: 'Review', button: null, links: [] },
        { heading: 'Actions', button: respondToRevision, links: [] },
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

    it('gives a manager who also edits the indicator one Actions section with both sets of links', () => {
      expect(
        sections({ ...submitted, actions: ['withdraw', 'assign_reviewers'] }, { canEdit: true }),
      ).toEqual([{ heading: 'Actions', button: assignFirst, links: [withdraw] }]);
      expect(sections({ ...inReview, actions: ['assign_reviewers'] }, { canEdit: true })).toEqual([
        { heading: 'Actions', button: null, links: [changeReviewers] },
      ]);
    });

    it('leaves a manager who reviewed it only the Review section once the round is answered', () => {
      expect(sections(sentBack, { isReviewer: true })).toEqual([
        { heading: 'Review', button: null, links: [] },
      ]);
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

  describe('for an admin', () => {
    it('offers a button to confirm the publication date of an approved draft', () => {
      expect(sections({ ...approved, actions: ['schedule'] })).toEqual([
        { heading: 'Actions', button: confirmDate, links: [] },
      ]);
    });

    it('offers a link to change the date once it is confirmed, and no button', () => {
      expect(sections({ ...scheduled, actions: ['change_publication_date'] })).toEqual([
        { heading: 'Actions', button: null, links: [changeDate] },
      ]);
    });
  });

  describe('for anyone with no section of their own, such as an admin', () => {
    it('keeps an empty Actions section for a new indicator', () => {
      expect(sections(newDraft)).toEqual([{ heading: 'Actions', button: null, links: [] }]);
    });

    it('holds the live page in the Actions section for a live indicator', () => {
      expect(sections(live)).toEqual([{ heading: 'Actions', button: null, links: [viewLive] }]);
    });
  });

  describe('for a publisher', () => {
    it('offers a button that starts an update of a live indicator with no draft', () => {
      expect(sections(live, { canEdit: true })).toEqual([
        { heading: 'Actions', button: startUpdate, links: [viewLive] },
      ]);
    });

    it('offers no update while one is open, or to a publisher who may not edit it', () => {
      expect(sections({ ...live, draftStatus: 'draft' }, { canEdit: true })[0]?.button).toBeNull();
      expect(sections(live)[0]?.button).toBeNull();
    });

    it('lists the live page before the task list', () => {
      expect(
        sections({ ...live, draftStatus: 'draft' }, { canEdit: true }).map(({ links }) => links),
      ).toEqual([[viewLive, { ...continueCreating, label: 'Continue updating indicator' }]]);
    });

    it('offers a button to respond to the requested revision in place of the task list link', () => {
      expect(sections({ ...sentBack, actions: ['resubmit'] }, { canEdit: true })).toEqual([
        { heading: 'Actions', button: respondToRevision, links: [] },
      ]);
    });

    it.each([
      [
        'pre-IMRG feedback',
        { kind: 'pre_imrg_feedback', flaggedTaskCount: 2 },
        'Respond to advised revisions',
      ],
      [
        'major revisions',
        { kind: 'major_revisions', flaggedTaskCount: 1 },
        'Respond to requested revision',
      ],
      [
        'a clarification request alone',
        { kind: 'minor_revisions', flaggedTaskCount: 0 },
        'Respond to clarification request',
      ],
      [
        'pre-IMRG clarification alone',
        { kind: 'pre_imrg_feedback', flaggedTaskCount: 0 },
        'Respond to clarification request',
      ],
    ] as const)('words the button for %s', (_case, draftResponse, label) => {
      const [actions] = sections({ ...sentBack, draftResponse }, { canEdit: true });

      expect(actions?.button?.label).toBe(label);
    });

    it('offers no response to a publisher who may not edit the indicator', () => {
      expect(sections(sentBack)).toEqual([{ heading: 'Actions', button: null, links: [] }]);
    });

    it('offers the withdrawal of a submission waiting for reviewers', () => {
      expect(sections({ ...submitted, actions: ['withdraw'] }, { canEdit: true })).toEqual([
        { heading: 'Actions', button: null, links: [withdraw] },
      ]);
    });
  });
});
