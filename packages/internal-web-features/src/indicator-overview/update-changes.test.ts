import type { UpdateChange } from '@fphd/internal-api-features/contract';
import { describe, expect, it } from 'vitest';

import { updateChangeRows } from './update-changes.ts';
import { wordDiff } from './word-diff.ts';

describe('updateChangeRows', () => {
  it('orders the rows as the update task list orders its tasks', () => {
    const changes: UpdateChange[] = [
      { task: 'update-summary', parts: [{ kind: 'value', field: 'updateSummary', value: 'New.' }] },
      { task: 'name', parts: [{ kind: 'text', field: 'name', before: 'A', after: 'B' }] },
      { task: 'polarity', parts: [{ kind: 'value', field: 'polarity', value: 'Lower is better' }] },
    ];

    expect(updateChangeRows(changes).map(({ section }) => section)).toEqual([
      'Polarity',
      'Name',
      'Update summary',
    ]);
  });

  it('labels each answer of a section that asks more than one question', () => {
    const [row] = updateChangeRows([
      {
        task: 'definition-and-rationale',
        parts: [{ kind: 'text', field: 'rationale', before: 'Old.', after: 'New.' }],
      },
    ]);

    expect(row?.lines).toEqual([
      {
        label: 'Rationale',
        change: { kind: 'diff', runs: wordDiff('Old.', 'New.') },
      },
    ]);
  });

  it('reads a choice left with no answer as None', () => {
    const [row] = updateChangeRows([
      { task: 'polarity', parts: [{ kind: 'value', field: 'polarity', value: null }] },
    ]);

    expect(row?.lines).toEqual([{ label: null, change: { kind: 'text', text: 'None' } }]);
  });

  it('counts the data values a data table of its own replaced', () => {
    const [row] = updateChangeRows([
      { task: 'data-table', parts: [{ kind: 'data_values_replaced', count: 52365 }] },
    ]);

    expect(row).toEqual({
      section: 'Data table',
      lines: [{ label: null, change: { kind: 'text', text: '52,365 data values replaced' } }],
    });
  });

  it('gives the update summary and the information for reviewers a row each', () => {
    const rows = updateChangeRows([
      {
        task: 'update-summary',
        parts: [
          { kind: 'value', field: 'updateSummary', value: 'Added the 2025 data.' },
          { kind: 'value', field: 'updateSummaryForReviewers', value: 'No other changes.' },
        ],
      },
    ]);

    expect(rows).toEqual([
      {
        section: 'Update summary',
        lines: [{ label: null, change: { kind: 'text', text: 'Added the 2025 data.' } }],
      },
      {
        section: 'Additional summary information for internal reviewers',
        lines: [{ label: null, change: { kind: 'text', text: 'No other changes.' } }],
      },
    ]);
  });
});
