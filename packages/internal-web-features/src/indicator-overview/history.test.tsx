// @vitest-environment jsdom
import { renderMarkdown } from '@fphd/ui/markdown';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { History } from './history.tsx';

afterEach(cleanup);

describe('History', () => {
  it('lists each entry with its day in UK time, what happened and who did it', () => {
    render(
      <History
        items={[
          {
            date: '2026-06-02T23:30:00.000Z',
            action: 'Indicator submitted for approval',
            by: 'Sam Taylor',
            rows: [],
          },
          { date: '2026-06-02', action: 'Indicator reviewed by IMRG', by: 'Jamie Evans', rows: [] },
        ]}
      />,
    );

    const entries = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(entries.map((entry) => entry.textContent)).toEqual([
      '3 June 2026Indicator submitted for approvalBy Sam Taylor',
      '2 June 2026Indicator reviewed by IMRGBy Jamie Evans',
    ]);
    expect(entries[0]?.querySelector('time')?.getAttribute('dateTime')).toBe(
      '2026-06-02T23:30:00.000Z',
    );
    expect(entries[0]?.querySelector('.fphd-body-italic')?.textContent).toBe('By Sam Taylor');
  });

  it('leaves out the By line where nothing records who', () => {
    render(
      <History
        items={[
          { date: '2026-05-02T09:00:00.000Z', action: 'Indicator published', by: null, rows: [] },
        ]}
      />,
    );

    expect(screen.getByRole('listitem').textContent).toBe('2 May 2026Indicator published');
  });

  it('shows the Section and Comments table under an entry that has rows', () => {
    render(
      <History
        items={[
          {
            date: '2026-11-03T10:00:00.000Z',
            action: 'Indicator resubmitted for approval.',
            by: 'Sam Taylor',
            rows: [
              { section: 'Polarity', comments: 'Revisions made' },
              {
                section: 'Response to revisions or clarifications',
                comments: renderMarkdown('Higher is **better**.', 's'),
              },
            ],
          },
          {
            date: '2026-11-01T10:00:00.000Z',
            action: 'Indicator first created',
            by: 'Sam Taylor',
            rows: [],
          },
        ]}
      />,
    );

    const table = screen.getByRole('table', { name: 'Indicator resubmitted for approval.' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Section', 'Comments']);
    expect(
      within(table)
        .getAllByRole('row')
        .slice(1)
        .map((row) => [...row.children].map((cell) => cell.textContent)),
    ).toEqual([
      ['Polarity', 'Revisions made'],
      ['Response to revisions or clarifications', 'Higher is better.'],
    ]);
    expect(table.querySelector('.fphd-markdown strong')?.textContent).toBe('better');
  });

  it('shows the Section and Changes table under an update, with free text as words removed and added', () => {
    render(
      <History
        items={[
          {
            date: '2026-11-12T10:00:00.000Z',
            action: 'Update submitted for review',
            by: 'Sam Taylor',
            rows: [],
            changes: [
              {
                section: 'Definition and rationale',
                lines: [
                  {
                    label: 'Rationale',
                    change: {
                      kind: 'diff',
                      runs: [
                        { change: 'unchanged', text: 'A measure of ' },
                        { change: 'removed', text: 'mortality' },
                        { change: 'added', text: 'health' },
                      ],
                    },
                  },
                ],
              },
              {
                section: 'Polarity',
                lines: [{ label: null, change: { kind: 'text', text: 'Higher is better' } }],
              },
            ],
          },
        ]}
      />,
    );

    const table = screen.getByRole('table', { name: 'Update submitted for review' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Section', 'Changes']);
    expect(
      within(table)
        .getAllByRole('row')
        .slice(1)
        .map((row) => [...row.children].map((cell) => cell.textContent)),
    ).toEqual([
      ['Definition and rationale', 'RationaleA measure of Removed: mortalityAdded: health'],
      ['Polarity', 'Higher is better'],
    ]);
    expect(table.querySelector('del.fphd-diff-removed')?.textContent).toBe('Removed: mortality');
    expect(table.querySelector('ins.fphd-diff-added')?.textContent).toBe('Added: health');
  });
});
