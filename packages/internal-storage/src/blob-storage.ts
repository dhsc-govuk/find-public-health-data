import type { Readable } from 'node:stream';

/** Files kept by name. A name is written once: putting it again is refused, not overwritten. */
export interface BlobStorage {
  /** Throws `BlobExistsError` when the name is already taken. */
  put(name: string, content: Readable): Promise<void>;
  /** Throws `BlobNotFoundError` when nothing is stored under the name. */
  get(name: string): Promise<Readable>;
  /** Succeeds whether or not anything was stored under the name. */
  delete(name: string): Promise<void>;
  /** Rejects when the container cannot be reached or read, as a start-up check. */
  ping(): Promise<void>;
}

export class BlobExistsError extends Error {
  constructor(blobName: string) {
    super(`A blob named ${blobName} already exists`);
    this.name = 'BlobExistsError';
  }
}

export class BlobNotFoundError extends Error {
  constructor(blobName: string) {
    super(`No blob named ${blobName}`);
    this.name = 'BlobNotFoundError';
  }
}
