import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { Readable } from 'node:stream';
import { buffer, text } from 'node:stream/consumers';
import { fileURLToPath } from 'node:url';

import { BlobServiceClient } from '@azure/storage-blob';
import { parseEnv, z } from '@fphd/config';
import { afterAll, describe, expect, it } from 'vitest';

import { createAzureBlobStorage } from './azure-blob-storage.ts';
import { itBehavesAsBlobStorage } from './blob-storage.testing.ts';
import { BlobExistsError } from './blob-storage.ts';

// Azurite, as the repo .env or CI's environment names it; values already set win over the file.
const envFile = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}
const { STORAGE_CONNECTION_STRING: connectionString } = parseEnv(
  z.object({ STORAGE_CONNECTION_STRING: z.string() }),
  process.env,
);

// A container of this file's own, so runs and files never see one another's blobs.
const container = `fphd-test-${randomBytes(6).toString('hex')}`;
const storage = await createAzureBlobStorage({ container, connectionString });

afterAll(async () => {
  await BlobServiceClient.fromConnectionString(connectionString).deleteContainer(container);
});

describe('createAzureBlobStorage', () => {
  itBehavesAsBlobStorage(storage);

  it('opens a container that already exists, with its blobs intact', async () => {
    await storage.put('indicator-3/batch-1.csv', Readable.from(['kept']));

    const reopened = await createAzureBlobStorage({ container, connectionString });

    expect(await text(await reopened.get('indicator-3/batch-1.csv'))).toBe('kept');
  });

  it('stores a file spanning several upload blocks, and refuses to overwrite it', async () => {
    const tenMegabytes = () =>
      Readable.from(Array.from({ length: 10 }, () => Buffer.alloc(2 ** 20, 'a')));

    await storage.put('indicator-2/batch-1.csv', tenMegabytes());

    await expect(storage.put('indicator-2/batch-1.csv', tenMegabytes())).rejects.toThrow(
      BlobExistsError,
    );
    expect((await buffer(await storage.get('indicator-2/batch-1.csv'))).length).toBe(10 * 2 ** 20);
  });

  it('fails a ping once its container is gone', async () => {
    const doomed = `${container}-gone`;
    const gone = await createAzureBlobStorage({ container: doomed, connectionString });
    await BlobServiceClient.fromConnectionString(connectionString).deleteContainer(doomed);

    await expect(gone.ping()).rejects.toMatchObject({ code: 'ContainerNotFound' });
  });
});
