import { describe, expect, it } from 'vitest';

import { overviewNotification } from './notifications.ts';

describe('overviewNotification', () => {
  it.each([
    [
      'reviewers-assigned',
      { type: 'success', text: 'Reviewers successfully assigned to indicator.' },
      { type: 'success', text: 'Reviewers successfully assigned to update' },
    ],
    [
      'review-approved',
      { type: 'success', text: 'Indicator approved for publishing' },
      { type: 'success', text: 'Update approved for publishing' },
    ],
    [
      'review-feedback-given',
      {
        type: 'important',
        colour: 'orange',
        text: 'Revisions or clarifications advised before indicator submitted for IMRG review',
      },
      {
        type: 'important',
        colour: 'orange',
        text: 'Revisions or clarifications requested before update can be published',
      },
    ],
  ] as const)('words %s for a new indicator and for an update', (flash, forNew, forUpdate) => {
    expect(overviewNotification(flash, 'new')).toEqual(forNew);
    expect(overviewNotification(flash, 'live')).toEqual(forUpdate);
  });
});
