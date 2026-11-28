import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { TABLES } from '../tables.ts';
import { exportPholio } from './export-pholio.ts';

const { exclusions, close, connect, observations } = vi.hoisted(() => ({
  exclusions: [
    {
      indicator_id: 108,
      grouping: { GroupingID: 42 },
      year_type_id: 3,
      reason: 'Academic quarters require a verified source date mapping',
    },
  ],
  close: vi.fn(),
  connect: vi.fn(),
  observations: vi.fn(),
}));

vi.mock('./source.ts', () => ({
  connectToPholio: async () => {
    connect();
    return { close };
  },
  queryPholio: async () => [{ database: 'pholio_test', snapshotAt: new Date('2026-01-01') }],
}));
// The lookups stage stands in for every stage that writes a table file into the output.
vi.mock('./lookups.ts', async () => {
  const { writeFile: write } = await import('node:fs/promises');
  const { join: joinPath } = await import('node:path');
  return {
    exportLookups: async ({ outDir }: { outDir: string }) => {
      await write(joinPath(outDir, 'note_type.csv.gz'), 'new');
      return { tables: Object.fromEntries(TABLES.map((table) => [table, { rows: 1 }])) };
    },
  };
});
vi.mock('./dimensions.ts', () => ({ exportDimensions: async () => ({ tables: {} }) }));
vi.mock('./geography.ts', () => ({ exportGeography: async () => ({ tables: {} }) }));
vi.mock('./indicators.ts', () => ({
  exportIndicators: async () => ({
    tables: {},
    indicatorNames: new Map([[108, 'Example']]),
    groupingBaselineExclusions: exclusions,
  }),
}));
vi.mock('./observations.ts', () => ({ exportObservations: observations }));

let parent: string;

beforeEach(async () => {
  parent = await mkdtemp(join(tmpdir(), 'fphd-export-pholio-'));
  close.mockClear();
  connect.mockClear();
  observations.mockReset().mockResolvedValue({ tables: {} });
});

afterEach(async () => {
  await rm(parent, { recursive: true, force: true });
});

function exportTo(outDir: string): Promise<void> {
  return exportPholio({
    connectionString: 'test',
    expectedDatabase: 'pholio_test',
    outDir,
    indicatorSelection: { kind: 'approved', indicators: [108] },
  });
}

it('records skipped grouping baselines in the source export manifest', async () => {
  const outDir = join(parent, 'export');

  await exportTo(outDir);

  const manifest = JSON.parse(await readFile(join(outDir, 'source-manifest.json'), 'utf8'));
  expect(manifest.grouping_baseline_exclusions).toEqual(exclusions);
  expect(close).toHaveBeenCalledOnce();
});

it('leaves only the new export once it succeeds', async () => {
  const outDir = join(parent, 'export');

  await exportTo(outDir);

  expect((await readdir(outDir)).sort()).toEqual(['note_type.csv.gz', 'source-manifest.json']);
  expect(await readdir(parent)).toEqual(['export']);
});

it('leaves no output directory when the export fails part way', async () => {
  const outDir = join(parent, 'export');
  observations.mockRejectedValue(new Error('Observation export failed'));

  await expect(exportTo(outDir)).rejects.toThrow('Observation export failed');

  expect(await readdir(parent)).toEqual([]);
  expect(close).toHaveBeenCalledOnce();
});

it('refuses an existing output directory and leaves the earlier export untouched', async () => {
  const outDir = join(parent, 'export');
  await mkdir(outDir);
  await writeFile(join(outDir, 'note_type.csv.gz'), 'old');

  await expect(exportTo(outDir)).rejects.toThrow('Output directory already exists');

  expect(await readdir(outDir)).toEqual(['note_type.csv.gz']);
  expect(await readFile(join(outDir, 'note_type.csv.gz'), 'utf8')).toBe('old');
  expect(await readdir(parent)).toEqual(['export']);
  expect(connect).not.toHaveBeenCalled();
});
