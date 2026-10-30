import type { NotesForReviewers } from './loader.ts';

/** Notes with every question answered. */
export const ANSWERED_NOTES: NotesForReviewers = {
  varianceAndQuality: {
    variation: 'Little.\nMostly by region.',
    qualityAssurance: 'Checked.',
    hasSourceDataIssues: 'yes',
    sourceDataIssuesDetail: 'Late returns.',
  },
  justifications: {
    ciMethodJustification: 'Standard.',
    dataSourcesJustification: 'The best available.',
    inequalitiesIncluded: 'Deprivation.',
    hasExclusions: 'no',
    exclusionsDetail: null,
    hasAutomation: 'yes',
    automationDetail: 'R scripts.',
  },
  otherComments: {
    sponsorsAndStakeholders: 'OHID.',
    hasReviewerComments: 'yes',
    reviewerCommentsDetail: 'Please look at 2020.',
  },
};

/** Notes with nothing answered yet. */
export const UNANSWERED_NOTES: NotesForReviewers = {
  varianceAndQuality: {
    variation: null,
    qualityAssurance: null,
    hasSourceDataIssues: null,
    sourceDataIssuesDetail: null,
  },
  justifications: {
    ciMethodJustification: null,
    dataSourcesJustification: null,
    inequalitiesIncluded: null,
    hasExclusions: null,
    exclusionsDetail: null,
    hasAutomation: null,
    automationDetail: null,
  },
  otherComments: {
    sponsorsAndStakeholders: null,
    hasReviewerComments: null,
    reviewerCommentsDetail: null,
  },
};
