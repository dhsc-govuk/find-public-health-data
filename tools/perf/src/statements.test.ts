import { describe, expect, it } from 'vitest';

import { describeStatements, type Statement, totalWork } from './statements.ts';

const statement = (overrides: Partial<Statement> = {}): Statement => ({
  role: 'public_api',
  query: 'select id from indicator where slug = $1',
  calls: 1,
  buffers: 4,
  rows: 1,
  ...overrides,
});

describe('totalWork', () => {
  it('sums the statements and takes the response size', () => {
    expect(
      totalWork(
        [
          statement({ calls: 2, buffers: 10, rows: 3 }),
          statement({ calls: 5, buffers: 7, rows: 1 }),
        ],
        2_048,
      ),
    ).toEqual({ statements: 7, buffers: 17, rows: 4, bytes: 2_048 });
  });

  it('counts no work when no statements ran', () => {
    expect(totalWork([], 512)).toEqual({ statements: 0, buffers: 0, rows: 0, bytes: 512 });
  });
});

describe('describeStatements', () => {
  it('lists the most called queries first, then the heaviest', () => {
    expect(
      describeStatements([
        statement({ query: 'select 1', calls: 1, buffers: 0 }),
        statement({ query: 'select a', calls: 3, buffers: 2 }),
        statement({ query: 'select b', calls: 3, buffers: 9, role: 'internal_api' }),
      ]),
    ).toEqual([
      '3 × internal_api, 1 rows, 9 buffers: select b',
      '3 × public_api, 1 rows, 2 buffers: select a',
      '1 × public_api, 1 rows, 0 buffers: select 1',
    ]);
  });

  it('puts each query on one line', () => {
    expect(
      describeStatements([statement({ query: '  select id\n  from topic\n\twhere x ' })]),
    ).toEqual(['1 × public_api, 1 rows, 4 buffers: select id from topic where x']);
  });

  it('cuts a long query short', () => {
    const [line] = describeStatements([statement({ query: `select ${'x'.repeat(400)}` })]);

    expect(line).toMatch(/: select x{293}…$/);
  });
});
