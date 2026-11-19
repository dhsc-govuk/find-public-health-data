import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { gzipSync } from 'node:zlib';

import { afterEach, describe, expect, it } from 'vitest';

import type { IndicatorTopicImportSummary } from './indicator-topic-import.ts';
import {
  assertPublishedRelationships,
  assertResetAllowed,
  assertSeedingAllowed,
  streamSeedCsv,
} from './seeding.ts';

const directories: string[] = [];

async function csvFile(content = 'id,name\n1,Test area\n'): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'fphd-copy-test-'));
  directories.push(directory);
  const file = join(directory, 'area.csv.gz');
  await writeFile(file, gzipSync(content));
  return file;
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe('streamSeedCsv', () => {
  it('streams the decompressed CSV into COPY', async () => {
    const chunks: Buffer[] = [];
    const writable = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        chunks.push(chunk);
        callback();
      },
    });

    await streamSeedCsv(await csvFile(), writable, 'area', 100);

    expect(Buffer.concat(chunks).toString()).toBe('id,name\n1,Test area\n');
  });

  it('allows COPY completion to use a separate timeout', async () => {
    const writable = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
      final(callback) {
        setTimeout(callback, 200);
      },
    });

    await streamSeedCsv(await csvFile(), writable, 'area', 100, 250);
  });

  it('aborts a COPY stalled before the source stream ends', async () => {
    const writable = new Writable({
      write() {
        // Simulate a database connection that stops accepting COPY chunks.
      },
    });

    await expect(
      streamSeedCsv(
        await csvFile(`id,name\n${'1,Test area\n'.repeat(100_000)}`),
        writable,
        'area',
        50,
      ),
    ).rejects.toThrow('COPY into "area" stopped making progress');
    expect(writable.destroyed).toBe(true);
  });
});

function relationships(
  overrides: Partial<IndicatorTopicImportSummary> = {},
): IndicatorTopicImportSummary {
  return {
    links: 2,
    subtopicLinks: 2,
    classificationLinks: 2,
    timestamps: 0,
    unknownIndicators: [],
    unknownTopics: [],
    unknownSubtopics: [],
    unknownClassifications: [],
    ...overrides,
  };
}

describe('assertPublishedRelationships', () => {
  it('accepts a complete published mapping', () => {
    expect(() => assertPublishedRelationships(relationships())).not.toThrow();
  });

  it('rejects missing indicators even when other assignments were loaded and reports their IDs', () => {
    expect(() =>
      assertPublishedRelationships(relationships({ unknownIndicators: [241, 93995] })),
    ).toThrow('missing indicator IDs: 241, 93995');
  });

  it('rejects a mapping that loaded no topic links', () => {
    expect(() => assertPublishedRelationships(relationships({ links: 0 }))).toThrow(
      'Published topic mapping did not match',
    );
  });

  it.each(['unknownTopics', 'unknownSubtopics', 'unknownClassifications'] as const)(
    'rejects a mapping containing %s',
    (field) => {
      expect(() =>
        assertPublishedRelationships({ ...relationships(), [field]: ['missing'] }),
      ).toThrow('Published topic mapping did not match');
    },
  );
});

describe('assertResetAllowed', () => {
  it.each(['local', 'test', 'dev', 'preview'])('allows a reset in %s', (appEnv) => {
    expect(() => assertResetAllowed(appEnv)).not.toThrow();
  });
  it.each(['production', undefined])('refuses a reset in %s', (appEnv) => {
    expect(() => assertResetAllowed(appEnv)).toThrow('Refusing to reset');
  });
  it('allows a reset in production when production is allowed', () => {
    expect(() => assertResetAllowed('production', { allowProduction: true })).not.toThrow();
  });
  it('still refuses an unset APP_ENV when production is allowed', () => {
    expect(() => assertResetAllowed(undefined, { allowProduction: true })).toThrow(
      'Refusing to reset',
    );
  });
  it('still refuses to seed preview', () => {
    expect(() => assertSeedingAllowed('preview')).toThrow('Refusing to seed dummy data');
  });
});
