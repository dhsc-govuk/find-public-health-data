import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';

import { BlobServiceClient } from '@azure/storage-blob';
import { parseEnv, z } from '@fphd/config';

import { createAzureBlobStorage } from './azure-blob-storage.ts';
import { BlobExistsError, BlobNotFoundError, type BlobStorage } from './blob-storage.ts';

/** Storage held in memory for unit tests, refusing and failing as the Azure one does. */
export function createFakeBlobStorage(): BlobStorage {
  const blobs = new Map<string, Buffer>();

  return {
    async put(name, content) {
      const bytes = await buffer(content);
      if (blobs.has(name)) {
        throw new BlobExistsError(name);
      }
      blobs.set(name, bytes);
    },

    async get(name) {
      const bytes = blobs.get(name);
      if (bytes === undefined) {
        throw new BlobNotFoundError(name);
      }
      return Readable.from([bytes]);
    },

    async delete(name) {
      blobs.delete(name);
    },

    async ping() {},
  };
}

export interface TestBlobStorage {
  storage: BlobStorage;
  container: string;
  /** Azurite's, for a test that opens or removes further containers itself. */
  connectionString: string;
  /** Deletes the container and every blob in it. */
  drop(): Promise<void>;
}

/**
 * Azure storage in a container of the test file's own, so runs and files never see one
 * another's blobs. For integration tests: it needs Azurite, named by STORAGE_CONNECTION_STRING
 * in the repo .env (which the integration tier's global setup loads) or CI's environment.
 */
export async function createTestBlobStorage(): Promise<TestBlobStorage> {
  const { STORAGE_CONNECTION_STRING: connectionString } = parseEnv(
    z.object({ STORAGE_CONNECTION_STRING: z.string() }),
    // biome-ignore lint/style/noProcessEnv: the test harness reads the env the global setup loaded
    process.env,
  );
  const container = `fphd-test-${randomBytes(6).toString('hex')}`;
  const storage = await createAzureBlobStorage({ container, connectionString });

  return {
    storage,
    container,
    connectionString,
    async drop() {
      await BlobServiceClient.fromConnectionString(connectionString).deleteContainer(container);
    },
  };
}
