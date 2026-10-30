import type { Work } from './budget.ts';

/** One distinct query an API role ran during a measured request, from pg_stat_statements. */
export type Statement = {
  role: string;
  query: string;
  calls: number;
  buffers: number;
  rows: number;
};

/** Long enough to tell queries apart by their columns and tables; the full text is in Postgres. */
const QUERY_LENGTH = 300;

/** A route's work: the statements' sums, so the totals and their breakdown always agree. */
export function totalWork(statements: Statement[], bytes: number): Work {
  return {
    statements: statements.reduce((sum, s) => sum + s.calls, 0),
    buffers: statements.reduce((sum, s) => sum + s.buffers, 0),
    rows: statements.reduce((sum, s) => sum + s.rows, 0),
    bytes,
  };
}

/** One line per query, most calls first, with its text on one line and cut short. */
export function describeStatements(statements: Statement[]): string[] {
  return [...statements]
    .sort((a, b) => b.calls - a.calls || b.buffers - a.buffers)
    .map(({ role, query, calls, buffers, rows }) => {
      const text = query.replace(/\s+/g, ' ').trim();
      const shortened = text.length > QUERY_LENGTH ? `${text.slice(0, QUERY_LENGTH)}…` : text;
      return `${calls} × ${role}, ${rows} rows, ${buffers} buffers: ${shortened}`;
    });
}
