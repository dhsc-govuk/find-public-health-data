import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { verifyPublishedSnapshot } from '../../../apps/operations/src/published-snapshot.ts';
import { readGzipCsv } from './csv.ts';
import { writeDevelopmentSource } from './export-dev-snapshot.testing.ts';
import { exportDevSnapshot } from './export-dev-snapshot.ts';
import { exportPholio } from './pholio/export-pholio.ts';

vi.mock('./pholio/export-pholio.ts', () => ({ exportPholio: vi.fn() }));
let directory: string;
afterEach(async () => {
  vi.resetAllMocks();
  if (directory) await rm(directory, { recursive: true, force: true });
});
it('builds an archive accepted by the receiver using the real tidy and rekey pipeline', async () => {
  directory = await mkdtemp(join(tmpdir(), 'dev-snapshot-'));
  vi.mocked(exportPholio).mockImplementation(({ outDir }) => writeDevelopmentSource(outDir));
  await exportDevSnapshot({ connectionString: 'test source', outDir: directory });
  const manifest = await verifyPublishedSnapshot(directory);
  expect(manifest.tables.indicator?.rows).toBe(1325);
  expect(manifest.reference_names).toBe('tidied');
  expect(manifest.writers).toBe('users');
  const source = JSON.parse(await readFile(join(directory, 'source-manifest.json'), 'utf8'));
  expect(source.reference_names).toBe('tidied');
  const values = [];
  for await (const row of readGzipCsv(join(directory, 'dimension_value.csv.gz'))) values.push(row);
  expect(values[1]?.[values[0]?.indexOf('name') ?? -1]).toBe('Female');
  expect((await stat(join(directory, 'snapshot.tar'))).size).toBeGreaterThan(0);
});

it('preserves profile metadata in both development archive manifests', async () => {
  directory = await mkdtemp(join(tmpdir(), 'dev-snapshot-'));
  const profileMetadata = [
    {
      indicator_id: 108,
      profile_id: 10,
      name: 'Framework 1.2 - Indicator',
      frequency: 'Updated quarterly',
      structured_frequency: null,
    },
  ];
  vi.mocked(exportPholio).mockImplementation(async ({ outDir }) => {
    await writeDevelopmentSource(outDir);
    const path = join(outDir, 'source-manifest.json');
    const source = JSON.parse(await readFile(path, 'utf8'));
    source.source.profile_metadata = profileMetadata;
    await writeFile(path, JSON.stringify(source));
  });
  await exportDevSnapshot({ connectionString: 'test source', outDir: directory });
  await verifyPublishedSnapshot(directory);
  for (const file of ['manifest.json', 'source-manifest.json']) {
    const manifest = JSON.parse(await readFile(join(directory, file), 'utf8'));
    expect(manifest.profile_metadata).toEqual(profileMetadata);
  }
});

it('checks the original source fingerprint before intentional publication exclusions', async () => {
  directory = await mkdtemp(join(tmpdir(), 'dev-snapshot-'));
  vi.mocked(exportPholio).mockImplementation(async ({ outDir }) => {
    await writeDevelopmentSource(outDir);
    const path = join(outDir, 'source-manifest.json');
    const source = JSON.parse(await readFile(path, 'utf8'));
    source.source_observations = 29_656_329;
    source.excluded_observations = 29_656_328;
    source.observation_exclusions = { year_range_not_in_grouping: 29_656_328 };
    await writeFile(path, JSON.stringify(source));
  });
  await exportDevSnapshot({ connectionString: 'test source', outDir: directory });
  const manifest = await verifyPublishedSnapshot(directory);
  expect(manifest.source_observations).toBe(29_656_329);
  expect(manifest.excluded_observations).toBe(29_656_328);
});

it('refuses a short export instead of reclassifying missing rows as exclusions', async () => {
  directory = await mkdtemp(join(tmpdir(), 'dev-snapshot-'));
  vi.mocked(exportPholio).mockImplementation(async ({ outDir }) => {
    await writeDevelopmentSource(outDir);
    const path = join(outDir, 'source-manifest.json');
    const source = JSON.parse(await readFile(path, 'utf8'));
    source.tables.observation.rows = 0;
    await writeFile(path, JSON.stringify(source));
  });
  await expect(
    exportDevSnapshot({ connectionString: 'test source', outDir: directory }),
  ).rejects.toThrow('Exported observations and recorded exclusions do not match the source count');
});

it('refuses a changed source fingerprint even when exported counts match the benchmark', async () => {
  directory = await mkdtemp(join(tmpdir(), 'dev-snapshot-'));
  vi.mocked(exportPholio).mockImplementation(async ({ outDir }) => {
    await writeDevelopmentSource(outDir);
    const path = join(outDir, 'source-manifest.json');
    const source = JSON.parse(await readFile(path, 'utf8'));
    source.source_observations = 29_656_330;
    await writeFile(path, JSON.stringify(source));
  });
  await expect(
    exportDevSnapshot({ connectionString: 'test source', outDir: directory }),
  ).rejects.toThrow(/29656330 observations/);
});
