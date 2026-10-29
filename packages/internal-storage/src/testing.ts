import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';

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
