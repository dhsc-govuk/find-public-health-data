import { describe, expect, it } from 'vitest';

import { historyEntries } from './indicator-history-entries.ts';
import type {
  HistoryResponseRecord,
  HistorySaveRecord,
  HistorySubmissionRecord,
  HistoryVersionRecord,
} from './indicator-history-repository.ts';

const VERSION = '01a00000-0000-7000-8000-0000000000v1';

// Postgres writes JSON timestamps with an offset and microseconds.
function at(time: string): string {
  return `2026-06-${time}.000000+00:00`;
}

function version(overrides: Partial<HistoryVersionRecord> = {}): HistoryVersionRecord {
  return { createdAt: at('01T09:00:00'), createdBy: 'Sam Taylor', publishedAt: null, ...overrides };
}

function submission(overrides: Partial<HistorySubmissionRecord>): HistorySubmissionRecord {
  return {
    versionId: VERSION,
    status: 'submitted',
    previousStatus: null,
    submittedAt: at('02T09:00:00'),
    submittedBy: 'Sam Taylor',
    endedAt: null,
    endedBy: null,
    revisionResponse: null,
    responses: [],
    ...overrides,
  };
}

function response(overrides: Partial<HistoryResponseRecord>): HistoryResponseRecord {
  return {
    reviewer: 'Jamie Evans',
    kind: 'minor_revisions',
    imrgReviewedOn: null,
    clarificationRequest: null,
    respondedAt: at('03T15:00:00'),
    flags: [],
    ...overrides,
  };
}

function save(time: string, fields: string[]): HistorySaveRecord {
  return { at: at(time), action: 'indicator.draft_updated', fields, reloaded: false };
}

const noRecords = {
  versions: [version()],
  submissions: [],
  assignments: [],
  scheduling: [],
  updates: [],
  saves: [],
};

describe('historyEntries', () => {
  it('starts with the first version’s creation', () => {
    expect(historyEntries(noRecords)).toEqual([
      { kind: 'created', at: '2026-06-01T09:00:00.000Z', by: 'Sam Taylor' },
    ]);
  });

  it('dates a migrated version’s creation by its publication when that came first', () => {
    const migrated = version({
      createdAt: at('20T09:00:00'),
      createdBy: 'PHOLIO migration',
      publishedAt: '2024-03-01T00:00:00+00:00',
    });

    expect(historyEntries({ ...noRecords, versions: [migrated] })).toEqual([
      { kind: 'published', at: '2024-03-01T00:00:00.000Z', by: null },
      { kind: 'created', at: '2024-03-01T00:00:00.000Z', by: 'PHOLIO migration' },
    ]);
  });

  it('lists each published version’s publication, and the creation of the first alone', () => {
    const versions = [
      version({ publishedAt: at('05T09:00:00') }),
      version({
        createdAt: at('10T09:00:00'),
        createdBy: 'Charlie Owen',
        publishedAt: at('20T09:00:00'),
      }),
    ];

    expect(historyEntries({ ...noRecords, versions }).map(({ kind }) => kind)).toEqual([
      'published',
      'published',
      'created',
    ]);
  });

  it('lists a round newest first: assignment, IMRG meeting and response', () => {
    const entries = historyEntries({
      ...noRecords,
      submissions: [
        submission({
          status: 'approved',
          responses: [
            response({
              kind: 'approved',
              imrgReviewedOn: '2026-06-03',
              respondedAt: at('03T15:00:00'),
            }),
          ],
        }),
      ],
      assignments: [{ at: at('02T10:00:00'), by: 'Avery Clarke', reviewers: ['Jamie Evans'] }],
    });

    expect(entries).toEqual([
      {
        kind: 'responded',
        at: '2026-06-03T15:00:00.000Z',
        by: 'Jamie Evans',
        response: 'approved',
        flags: [],
        clarificationRequest: null,
      },
      { kind: 'imrg_reviewed', on: '2026-06-03', by: 'Jamie Evans' },
      {
        kind: 'reviewers_assigned',
        at: '2026-06-02T10:00:00.000Z',
        by: 'Avery Clarke',
        reviewers: ['Jamie Evans'],
      },
      { kind: 'submitted', at: '2026-06-02T09:00:00.000Z', by: 'Sam Taylor' },
      { kind: 'created', at: '2026-06-01T09:00:00.000Z', by: 'Sam Taylor' },
    ]);
  });

  it('lists the publication date’s confirmation and each change after the approval', () => {
    const entries = historyEntries({
      ...noRecords,
      submissions: [
        submission({
          status: 'approved',
          responses: [response({ kind: 'approved', respondedAt: at('03T15:00:00') })],
        }),
      ],
      scheduling: [
        { at: at('04T09:00:00'), by: 'Riley Singh', action: 'indicator.publication_scheduled' },
        { at: at('05T09:00:00'), by: 'Riley Singh', action: 'indicator.publication_date_changed' },
      ],
    });

    expect(entries.slice(0, 3)).toEqual([
      { kind: 'publication_date_changed', at: '2026-06-05T09:00:00.000Z', by: 'Riley Singh' },
      { kind: 'publication_scheduled', at: '2026-06-04T09:00:00.000Z', by: 'Riley Singh' },
      expect.objectContaining({ kind: 'responded', response: 'approved' }),
    ]);
  });

  it('lists each update started after the publication it updates', () => {
    const entries = historyEntries({
      ...noRecords,
      versions: [version({ publishedAt: at('02T09:00:00') })],
      updates: [{ at: at('10T09:00:00'), by: 'Charlie Owen' }],
    });

    expect(entries).toEqual([
      { kind: 'update_started', at: '2026-06-10T09:00:00.000Z', by: 'Charlie Owen' },
      { kind: 'published', at: '2026-06-02T09:00:00.000Z', by: null },
      { kind: 'created', at: '2026-06-01T09:00:00.000Z', by: 'Sam Taylor' },
    ]);
  });

  it('gives a response its flags in task list order, with their notes and the clarification', () => {
    const entries = historyEntries({
      ...noRecords,
      submissions: [
        submission({
          status: 'changes_requested',
          responses: [
            response({
              kind: 'pre_imrg_feedback',
              clarificationRequest: 'Which **year** is this?',
              flags: [
                { task: 'tagging', notes: 'Add a topic' },
                { task: 'polarity', notes: 'Higher is better' },
                { task: 'name', notes: 'Shorter, please' },
              ],
            }),
          ],
        }),
      ],
    });

    expect(entries[0]).toEqual({
      kind: 'responded',
      at: '2026-06-03T15:00:00.000Z',
      by: 'Jamie Evans',
      response: 'pre_imrg_feedback',
      flags: [
        { task: 'name', notes: 'Shorter, please' },
        { task: 'polarity', notes: 'Higher is better' },
        { task: 'tagging', notes: 'Add a topic' },
      ],
      clarificationRequest: 'Which **year** is this?',
    });
  });

  it('puts an IMRG meeting on an earlier day at the end of that day', () => {
    const entries = historyEntries({
      ...noRecords,
      submissions: [
        submission({
          status: 'approved',
          responses: [
            response({
              kind: 'approved',
              imrgReviewedOn: '2026-06-02',
              respondedAt: at('04T09:00:00'),
            }),
          ],
        }),
      ],
      // Assigned late on the meeting's day, in UK time.
      assignments: [{ at: at('02T21:00:00'), by: 'Avery Clarke', reviewers: [] }],
    });

    expect(entries.map(({ kind }) => kind)).toEqual([
      'responded',
      'imrg_reviewed',
      'reviewers_assigned',
      'submitted',
      'created',
    ]);
  });

  it('reads a withdrawal, and the submission after it as a submission', () => {
    const entries = historyEntries({
      ...noRecords,
      submissions: [
        submission({ status: 'withdrawn', endedAt: at('02T12:00:00'), endedBy: 'Charlie Owen' }),
        submission({ previousStatus: 'withdrawn', submittedAt: at('03T09:00:00') }),
      ],
    });

    expect(entries.map(({ kind }) => kind)).toEqual([
      'submitted',
      'withdrawn',
      'submitted',
      'created',
    ]);
    expect(entries[1]).toEqual({
      kind: 'withdrawn',
      at: '2026-06-02T12:00:00.000Z',
      by: 'Charlie Owen',
    });
  });

  describe('a resubmission', () => {
    const sentBack = submission({
      status: 'changes_requested',
      revisionResponse: 'Done as asked',
      responses: [
        response({
          respondedAt: at('03T15:00:00'),
          flags: [
            { task: 'data-table', notes: 'Check the data' },
            { task: 'definition-and-rationale', notes: 'Clearer, please' },
            { task: 'name', notes: 'Shorter' },
          ],
        }),
      ],
    });
    const resubmitted = submission({
      previousStatus: 'changes_requested',
      submittedAt: at('05T09:00:00'),
    });

    function flagsAfter(saves: HistorySaveRecord[]) {
      const entry = historyEntries({
        ...noRecords,
        submissions: [sentBack, resubmitted],
        saves,
      }).find(({ kind }) => kind === 'resubmitted');
      return entry?.kind === 'resubmitted' ? entry : undefined;
    }

    it('lists the flags in task list order with the reply', () => {
      expect(flagsAfter([])).toEqual({
        kind: 'resubmitted',
        at: '2026-06-05T09:00:00.000Z',
        by: 'Sam Taylor',
        flags: [
          { task: 'name', revised: false },
          { task: 'data-table', revised: false },
          { task: 'definition-and-rationale', revised: false },
        ],
        reply: 'Done as asked',
      });
    });

    it('counts a task revised by any save that changed it, before or after its flag cleared', () => {
      const entry = flagsAfter([
        save('04T09:00:00', ['flags']),
        save('04T10:00:00', ['definition']),
        save('04T11:00:00', ['flags', 'name', 'slug']),
      ]);

      expect(entry?.flags).toEqual([
        { task: 'name', revised: true },
        { task: 'data-table', revised: false },
        { task: 'definition-and-rationale', revised: true },
      ]);
    });

    it('ignores saves outside the round', () => {
      const entry = flagsAfter([
        save('03T14:00:00', ['definition']),
        save('06T09:00:00', ['name']),
      ]);

      expect(entry?.flags.every(({ revised }) => !revised)).toBe(true);
    });

    it('counts the data table revised when new data was loaded, not when it was confirmed again', () => {
      const confirmed = (reloaded: boolean): HistorySaveRecord => ({
        at: at('04T09:00:00'),
        action: 'indicator.data_table_confirmed',
        fields: ['flags', 'dataTableConfirmedAt'],
        reloaded,
      });

      expect(flagsAfter([confirmed(false)])?.flags).toContainEqual({
        task: 'data-table',
        revised: false,
      });
      expect(flagsAfter([confirmed(true)])?.flags).toContainEqual({
        task: 'data-table',
        revised: true,
      });
    });

    it('takes its flags from the same version’s round', () => {
      const otherVersion = submission({ versionId: 'v0', status: 'changes_requested' });
      const entries = historyEntries({
        ...noRecords,
        submissions: [sentBack, otherVersion, resubmitted],
      });

      expect(entries.find(({ kind }) => kind === 'resubmitted')).toMatchObject({
        reply: 'Done as asked',
      });
    });
  });
});
