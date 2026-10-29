import { PassThrough, Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { ManagedIdentityCredential } from '@azure/identity';
import { BlobServiceClient, type ContainerClient, RestError } from '@azure/storage-blob';

import { BlobExistsError, BlobNotFoundError, type BlobStorage } from './blob-storage.ts';
import type { StorageConfig } from './env.ts';

/** Over a connection string, as for Azurite, the container is created if missing. */
export async function createAzureBlobStorage(config: StorageConfig): Promise<BlobStorage> {
  const container = containerClient(config);
  if ('connectionString' in config) {
    await container.createIfNotExists();
  }

  return {
    async put(name, content) {
      // uploadStream hangs if the source closes early; pipeline rejects instead.
      const source = new PassThrough();
      try {
        await Promise.all([
          pipeline(content, source),
          container.getBlockBlobClient(name).uploadStream(source, undefined, undefined, {
            conditions: { ifNoneMatch: '*' },
          }),
        ]);
      } catch (error) {
        source.destroy();
        throw hasErrorCode(error, 'BlobAlreadyExists') ? new BlobExistsError(name) : error;
      }
    },

    async get(name) {
      const body = (await download(container, name)).readableStreamBody;
      if (!(body instanceof Readable)) {
        throw new Error(`Downloading blob ${name} returned no Node stream`);
      }
      return body;
    },

    async delete(name) {
      await container.getBlobClient(name).deleteIfExists();
    },

    async ping() {
      await container.getProperties();
    },
  };
}

function containerClient(config: StorageConfig): ContainerClient {
  const service =
    'connectionString' in config
      ? BlobServiceClient.fromConnectionString(config.connectionString)
      : new BlobServiceClient(
          config.accountUrl,
          new ManagedIdentityCredential({ clientId: config.clientId }),
        );
  return service.getContainerClient(config.container);
}

async function download(container: ContainerClient, name: string) {
  try {
    return await container.getBlobClient(name).download();
  } catch (error) {
    throw hasErrorCode(error, 'BlobNotFound') ? new BlobNotFoundError(name) : error;
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof RestError && error.code === code;
}
