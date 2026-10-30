import { describe, expect, it } from 'vitest';

import { topic } from './schema.ts';
import {
  newTestRun,
  nullColumns,
  runTestDatabases,
  staleTestDatabases,
  templateName,
} from './testing.ts';

const NOW = new Date('2026-10-30T12:00:00Z');
const AN_HOUR_AGO = newTestRun(new Date('2026-10-30T11:00:00Z'));
const TWO_DAYS_AGO = newTestRun(new Date('2026-10-28T12:00:00Z'));

describe('newTestRun', () => {
  it('starts with the time in Unix seconds and differs between runs started together', () => {
    const run = newTestRun(NOW);

    expect(run).toMatch(/^1793361600_[0-9a-f]{6}$/);
    expect(newTestRun(NOW)).not.toBe(run);
  });
});

describe('staleTestDatabases', () => {
  it('keeps the databases of a run that started within the day', () => {
    const names = [templateName(AN_HOUR_AGO, 'seeded'), `fphd_test_${AN_HOUR_AGO}_0123456789ab`];

    expect(staleTestDatabases(names, NOW)).toEqual([]);
  });

  it('picks the databases of a run that started over a day ago', () => {
    const names = [templateName(TWO_DAYS_AGO, 'schema'), `fphd_test_${TWO_DAYS_AGO}_0123456789ab`];

    expect(staleTestDatabases(names, NOW)).toEqual(names);
  });

  it('picks test databases named before runs had ids', () => {
    const names = ['fphd_test_schema', 'fphd_test_seeded', 'fphd_test_0123456789ab'];

    expect(staleTestDatabases(names, NOW)).toEqual(names);
  });

  it('leaves databases outside the test prefix alone', () => {
    expect(staleTestDatabases(['fphd', 'postgres', 'fphd_testing'], NOW)).toEqual([]);
  });
});

describe('runTestDatabases', () => {
  it("picks only the given run's templates and copies", () => {
    const other = newTestRun(NOW);
    const ours = [templateName(AN_HOUR_AGO, 'schema'), `fphd_test_${AN_HOUR_AGO}_0123456789ab`];

    expect(
      runTestDatabases(
        [...ours, templateName(other, 'schema'), 'fphd_test_schema', 'fphd'],
        AN_HOUR_AGO,
      ),
    ).toEqual(ours);
  });
});

describe('nullColumns', () => {
  it('gives every column of the table, and nothing else, as null', () => {
    expect(nullColumns(topic)).toEqual({
      id: null,
      slug: null,
      title: null,
      description: null,
      createdAt: null,
      updatedAt: null,
      createdBy: null,
      updatedBy: null,
    });
  });
});
