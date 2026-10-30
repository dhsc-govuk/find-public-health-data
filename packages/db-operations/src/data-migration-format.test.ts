import { describe, expect, it } from 'vitest';
import { baselineManifestSchema, DATA_MIGRATION_NULL } from './data-migration-manifest.ts';

describe('the migration format', () => {
  it('requires version 4 with explicit area status', () => {
    const manifest = {
      format_version: 4,
      schema: 'canonical-v4',
      migration_id: 'taxonomy-fixture',
      source: {
        system: 'fingertips',
        environment: 'live',
        database: 'fixture',
        snapshot_at: '2026-10-21T00:00:00Z',
        cutoff_at: '2026-10-21T00:00:00Z',
      },
      source_csv_null: DATA_MIGRATION_NULL,
      id_mapping: 'deterministic-uuidv7-v1',
      kind: 'baseline',
      predecessor: null,
      relationships: {
        file: 'indicator-relationships.json',
        rows: 0,
        bytes: 0,
        sha256: '0'.repeat(64),
      },
      tables: {},
    };
    expect(baselineManifestSchema.safeParse(manifest).success).toBe(true);
    expect(
      baselineManifestSchema.safeParse({ ...manifest, format_version: 3, schema: 'canonical-v3' })
        .success,
    ).toBe(false);
  });
});
