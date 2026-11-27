import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { sha256 } from './sha256.ts';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe('sha256', () => {
  it("gives the hex digest of the file's bytes", async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sha256-'));
    directories.push(directory);
    const contents = Buffer.alloc(200_000, 'fphd');
    const path = join(directory, 'file.bin');
    await writeFile(path, contents);

    expect(await sha256(path)).toBe(createHash('sha256').update(contents).digest('hex'));
  });
});
