import { Readable } from 'node:stream';
import { buffer, text } from 'node:stream/consumers';

import { BlobServiceClient } from '@azure/storage-blob';
import { afterAll, describe, expect, it } from 'vitest';

import { createAzureBlobStorage } from './azure-blob-storage.ts';
import { itBehavesAsBlobStorage } from './blob-storage.testing.ts';
import { BlobExistsError } from './blob-storage.ts';
import { createTestBlobStorage } from './testing.ts';

const testStorage = await createTestBlobStorage();
const { storage, container, connectionString } = testStorage;

afterAll(async () => {
  await testStorage.drop();
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
