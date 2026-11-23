import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';

import { TABLES } from '../tables.ts';
import { exportPholio } from './export-pholio.ts';

const { exclusions, close } = vi.hoisted(() => ({
  exclusions: [
    {
      indicator_id: 108,
      grouping: { GroupingID: 42 },
      year_type_id: 3,
      reason: 'Academic quarters require a verified source date mapping',
    },
  ],
  close: vi.fn(),
}));

vi.mock('./source.ts', () => ({
  connectToPholio: async () => ({ close }),
  queryPholio: async () => [{ database: 'pholio_test', snapshotAt: new Date('2026-01-01') }],
}));
vi.mock('./lookups.ts', () => ({
  exportLookups: async () => ({
    tables: Object.fromEntries(TABLES.map((table) => [table, { rows: 1 }])),
  }),
}));
vi.mock('./dimensions.ts', () => ({ exportDimensions: async () => ({ tables: {} }) }));
vi.mock('./geography.ts', () => ({ exportGeography: async () => ({ tables: {} }) }));
vi.mock('./indicators.ts', () => ({
  exportIndicators: async () => ({
    tables: {},
    indicatorNames: new Map([[108, 'Example']]),
    groupingBaselineExclusions: exclusions,
  }),
}));
vi.mock('./observations.ts', () => ({ exportObservations: async () => ({ tables: {} }) }));

it('records skipped grouping baselines in the source export manifest', async () => {
  const outDir = await mkdtemp(join(tmpdir(), 'fphd-export-manifest-'));
  try {
    await exportPholio({
      connectionString: 'test',
      expectedDatabase: 'pholio_test',
      outDir,
      indicatorSelection: { kind: 'approved', indicators: [108] },
    });
    const manifest = JSON.parse(await readFile(join(outDir, 'source-manifest.json'), 'utf8'));
    expect(manifest.grouping_baseline_exclusions).toEqual(exclusions);
    expect(close).toHaveBeenCalledOnce();
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});
