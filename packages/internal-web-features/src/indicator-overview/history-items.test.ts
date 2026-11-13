import type { HistoryEntry } from '@fphd/internal-api-features/contract';
import { describe, expect, it } from 'vitest';

import { historyItems } from './history-items.ts';

const at = '2026-11-03T10:15:00.000Z';

function itemOf(entry: HistoryEntry) {
  const [item] = historyItems({ entries: [entry] });
  return item;
}

function small(html: string) {
  return { markdownHtml: `<p class="govuk-body-s">${html}</p>` };
}

describe('historyItems', () => {
  it('keeps the order the API gives', () => {
    const items = historyItems({
      entries: [
        { kind: 'submitted', at: '2026-11-04T09:00:00.000Z', by: 'Sam Taylor' },
        { kind: 'imrg_reviewed', on: '2026-11-04', by: 'Jamie Evans' },
        { kind: 'created', at: '2026-11-01T09:00:00.000Z', by: 'Sam Taylor' },
      ],
    });

    expect(items.map(({ action }) => action)).toEqual([
      'Indicator submitted for approval',
      'Indicator reviewed by IMRG',
      'Indicator first created',
    ]);
  });

  it.each([
    ['created', 'Indicator first created'],
    ['submitted', 'Indicator submitted for approval'],
    ['withdrawn', 'Indicator submission withdrawn'],
    ['publication_scheduled', 'Publication date confirmed'],
    ['publication_date_changed', 'Publication date changed'],
    ['update_started', 'Indicator update started'],
  ] as const)('words a %s entry and names who did it', (kind, action) => {
    expect(itemOf({ kind, at, by: 'Sam Taylor' })).toEqual({
      date: at,
      action,
      by: 'Sam Taylor',
      rows: [],
    });
  });

  it('words an update submitted for review, with its Section and Changes rows', () => {
    const item = itemOf({
      kind: 'update_submitted',
      at,
      by: 'Sam Taylor',
      changes: [
        {
          task: 'polarity',
          parts: [{ kind: 'value', field: 'polarity', value: 'Higher is better' }],
        },
      ],
    });

    expect(item).toEqual({
      date: at,
      action: 'Update submitted for review',
      by: 'Sam Taylor',
      rows: [],
      changes: [
        {
          section: 'Polarity',
          lines: [{ label: null, change: { kind: 'text', text: 'Higher is better' } }],
        },
      ],
    });
  });

  it('names nobody for a publication', () => {
    expect(itemOf({ kind: 'published', at, by: null })).toEqual({
      date: at,
      action: 'Indicator published',
      by: null,
      rows: [],
    });
  });

  it.each([
    [['Jamie Evans'], 'Indicator assigned for review by Jamie Evans.'],
    [['Jamie Evans', 'Robin Shaw'], 'Indicator assigned for review by Jamie Evans and Robin Shaw.'],
    [
      ['Avery Clarke', 'Jamie Evans', 'Robin Shaw'],
      'Indicator assigned for review by Avery Clarke, Jamie Evans and Robin Shaw.',
    ],
  ])('names the reviewers an assignment leaves, %j', (reviewers, action) => {
    expect(
      itemOf({ kind: 'reviewers_assigned', at, by: 'Avery Clarke', reviewers, isUpdate: false }),
    ).toEqual({ date: at, action, by: 'Avery Clarke', rows: [] });
  });

  it("names an update's reviewers as assigned to the update", () => {
    expect(
      itemOf({
        kind: 'reviewers_assigned',
        at,
        by: 'Avery Clarke',
        reviewers: ['Jamie Evans', 'Robin Shaw'],
        isUpdate: true,
      })?.action,
    ).toBe('Update assigned for review by Jamie Evans and Robin Shaw.');
  });

  it("dates an IMRG review by the meeting's day", () => {
    expect(itemOf({ kind: 'imrg_reviewed', on: '2026-06-02', by: 'Jamie Evans' })).toEqual({
      date: '2026-06-02',
      action: 'Indicator reviewed by IMRG',
      by: 'Jamie Evans',
      rows: [],
    });
  });

  it.each([
    [
      'pre_imrg_feedback',
      'Revisions or clarifications advised before indicator submitted for IMRG review.',
    ],
    ['minor_revisions', 'Indicator requires minor revisions to be approved for publishing.'],
    ['major_revisions', 'Indicator requires major revisions to be approved for publishing.'],
    ['approved', 'Indicator approved for publishing'],
  ] as const)('words a %s response', (response, action) => {
    expect(
      itemOf({
        kind: 'responded',
        at,
        by: 'Jamie Evans',
        response,
        flags: [],
        clarificationRequest: null,
        isUpdate: false,
      }),
    ).toEqual({ date: at, action, by: 'Jamie Evans', rows: [] });
  });

  it.each([
    [
      'pre_imrg_feedback',
      'Revisions or clarifications requested before update can be approved for publishing.',
    ],
    ['approved', 'Update approved for publishing'],
  ] as const)("words an update reviewer's %s response", (response, action) => {
    expect(
      itemOf({
        kind: 'responded',
        at,
        by: 'Jamie Evans',
        response,
        flags: [],
        clarificationRequest: null,
        isUpdate: true,
      })?.action,
    ).toBe(action);
  });

  it("lists a response's flagged sections by their task titles, then its clarification request", () => {
    const item = itemOf({
      kind: 'responded',
      at,
      by: 'Jamie Evans',
      response: 'pre_imrg_feedback',
      flags: [
        { task: 'polarity', notes: 'Is **higher** better?' },
        { task: 'calculation', notes: 'Show the formula.' },
      ],
      clarificationRequest: 'Which *years*?',
      isUpdate: false,
    });

    expect(item?.rows).toEqual([
      { section: 'Polarity', comments: small('Is <strong>higher</strong> better?') },
      { section: 'How the indicator was calculated', comments: small('Show the formula.') },
      { section: 'Clarification request', comments: small('Which <em>years</em>?') },
    ]);
  });

  it('says whether each flagged section was revised for a resubmission, then the reply', () => {
    const item = itemOf({
      kind: 'resubmitted',
      at,
      by: 'Sam Taylor',
      flags: [
        { task: 'polarity', revised: true },
        { task: 'data-table', revised: false },
      ],
      reply: 'Higher is **better**.',
      isUpdate: false,
    });

    expect(item).toEqual({
      date: at,
      action: 'Indicator resubmitted for approval.',
      by: 'Sam Taylor',
      rows: [
        { section: 'Polarity', comments: 'Revisions made' },
        { section: 'Data table', comments: 'No revisions made' },
        {
          section: 'Response to revisions or clarifications',
          comments: small('Higher is <strong>better</strong>.'),
        },
      ],
    });
  });

  it('lists no reply for a resubmission without one', () => {
    const item = itemOf({
      kind: 'resubmitted',
      at,
      by: 'Sam Taylor',
      flags: [{ task: 'polarity', revised: false }],
      reply: null,
      isUpdate: false,
    });

    expect(item?.rows).toEqual([{ section: 'Polarity', comments: 'No revisions made' }]);
  });

  it("words an update's resubmission as resubmitted for review", () => {
    const item = itemOf({
      kind: 'resubmitted',
      at,
      by: 'Sam Taylor',
      flags: [{ task: 'update-summary', revised: true }],
      reply: 'Said why.',
      isUpdate: true,
    });

    expect(item?.action).toBe('Update resubmitted for review.');
    expect(item?.rows[0]).toEqual({ section: 'Update summary', comments: 'Revisions made' });
  });

  it.each([
    ['imrg_review', 'Update sent for IMRG review'],
    ['publish_with_history', 'Update approved for publishing with visibility in history'],
    ['publish_without_history', 'Update approved for publishing without visibility in history'],
  ] as const)("words the core team's %s decision", (decision, action) => {
    expect(itemOf({ kind: 'update_decided', at, by: 'Riley Singh', decision })).toEqual({
      date: at,
      action,
      by: 'Riley Singh',
      rows: [],
    });
  });

  it("lists the core team's request for revisions with its flagged sections, the update summary among them", () => {
    const item = itemOf({
      kind: 'update_revisions_requested',
      at,
      by: 'Riley Singh',
      flags: [{ task: 'update-summary', notes: 'Say what changed.' }],
      clarificationRequest: 'Why now?',
    });

    expect(item).toEqual({
      date: at,
      action: 'Revisions or clarifications requested before IMRG review',
      by: 'Riley Singh',
      rows: [
        { section: 'Update summary', comments: small('Say what changed.') },
        { section: 'Clarification request', comments: small('Why now?') },
      ],
    });
  });
});
