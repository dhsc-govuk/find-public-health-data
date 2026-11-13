import {
  type HistoryEntry,
  INDICATOR_TASK_TITLES,
  type IndicatorHistory,
  type ReviewResponseKind,
} from '@fphd/internal-api-features/contract';
import { type MarkdownHtml, renderMarkdown } from '@fphd/ui/markdown';

import { type ChangeRow, updateChangeRows } from './update-changes.ts';

/** A row of the Section and Comments table under an entry: our wording, or Markdown a user wrote. */
export interface HistoryRow {
  section: string;
  comments: string | MarkdownHtml;
}

/** One entry of the History tab, worded as the prototype words it. */
export interface HistoryItem {
  /** When it happened: an instant, or the day of an IMRG meeting. */
  date: string;
  action: string;
  /** Who did it, where anything records who. */
  by: string | null;
  rows: readonly HistoryRow[];
  /** What an update changed, for its Section and Changes table; absent for any other entry. */
  changes?: readonly ChangeRow[];
}

const RESPONSE_ACTIONS: Readonly<Record<ReviewResponseKind, string>> = {
  pre_imrg_feedback:
    'Revisions or clarifications advised before indicator submitted for IMRG review.',
  minor_revisions: 'Indicator requires minor revisions to be approved for publishing.',
  major_revisions: 'Indicator requires major revisions to be approved for publishing.',
  approved: 'Indicator approved for publishing',
};

type DecisionEntry = Extract<HistoryEntry, { kind: 'update_decided' }>;

const DECISION_ACTIONS: Readonly<Record<DecisionEntry['decision'], string>> = {
  imrg_review: 'Update sent for IMRG review',
  publish_with_history: 'Update approved for publishing with visibility in history',
  publish_without_history: 'Update approved for publishing without visibility in history',
};

const names = new Intl.ListFormat('en-GB', { type: 'conjunction' });

function markdownRow(section: string, text: string): HistoryRow {
  return { section, comments: renderMarkdown(text, 's') };
}

/** What a response asked to revise or clarify, as rows of the Section and Comments table. */
function requestedRows({
  flags,
  clarificationRequest,
}: Extract<HistoryEntry, { kind: 'responded' | 'update_revisions_requested' }>): HistoryRow[] {
  return [
    ...flags.map(({ task, notes }) => markdownRow(INDICATOR_TASK_TITLES[task], notes)),
    ...(clarificationRequest === null
      ? []
      : [markdownRow('Clarification request', clarificationRequest)]),
  ];
}

function historyItem(entry: HistoryEntry): HistoryItem {
  switch (entry.kind) {
    case 'created':
      return { date: entry.at, action: 'Indicator first created', by: entry.by, rows: [] };
    case 'published':
      return { date: entry.at, action: 'Indicator published', by: null, rows: [] };
    case 'submitted':
      return { date: entry.at, action: 'Indicator submitted for approval', by: entry.by, rows: [] };
    case 'withdrawn':
      return { date: entry.at, action: 'Indicator submission withdrawn', by: entry.by, rows: [] };
    case 'reviewers_assigned':
      return {
        date: entry.at,
        action: `Indicator assigned for review by ${names.format(entry.reviewers)}.`,
        by: entry.by,
        rows: [],
      };
    case 'imrg_reviewed':
      return { date: entry.on, action: 'Indicator reviewed by IMRG', by: entry.by, rows: [] };
    case 'responded':
      return {
        date: entry.at,
        action: RESPONSE_ACTIONS[entry.response],
        by: entry.by,
        rows: requestedRows(entry),
      };
    case 'resubmitted':
      return {
        date: entry.at,
        action: 'Indicator resubmitted for approval.',
        by: entry.by,
        rows: [
          ...entry.flags.map(({ task, revised }) => ({
            section: INDICATOR_TASK_TITLES[task],
            comments: revised ? 'Revisions made' : 'No revisions made',
          })),
          ...(entry.reply === null
            ? []
            : [markdownRow('Response to revisions or clarifications', entry.reply)]),
        ],
      };
    case 'publication_scheduled':
      return { date: entry.at, action: 'Publication date confirmed', by: entry.by, rows: [] };
    case 'publication_date_changed':
      return { date: entry.at, action: 'Publication date changed', by: entry.by, rows: [] };
    case 'update_started':
      return { date: entry.at, action: 'Indicator update started', by: entry.by, rows: [] };
    case 'update_submitted':
      return {
        date: entry.at,
        action: 'Update submitted for review',
        by: entry.by,
        rows: [],
        changes: updateChangeRows(entry.changes),
      };
    case 'update_decided':
      return { date: entry.at, action: DECISION_ACTIONS[entry.decision], by: entry.by, rows: [] };
    case 'update_revisions_requested':
      return {
        date: entry.at,
        action: 'Revisions or clarifications requested before IMRG review',
        by: entry.by,
        rows: requestedRows(entry),
      };
  }
}

/** The indicator's history as the tab shows it, in the API's order, with Markdown rendered. */
export function historyItems({ entries }: IndicatorHistory): HistoryItem[] {
  return entries.map(historyItem);
}
