import { Readable } from 'node:stream';
import { text } from 'node:stream/consumers';

import { expect, it } from 'vitest';

import { BlobExistsError, BlobNotFoundError, type BlobStorage } from './blob-storage.ts';

function streamOf(content: string): Readable {
  return Readable.from([Buffer.from(content)]);
}

/** A source that yields one chunk, then is destroyed, with `error` or without one. */
function streamCutShort(error?: Error): Readable {
  let sent = false;
  return new Readable({
    read() {
      if (sent) {
        this.destroy(error);
      } else {
        sent = true;
        this.push('area_code,value\n');
      }
    },
  });
}

/** The behaviour every `BlobStorage` shares, so the in-memory one cannot drift from Azure's. */
export function itBehavesAsBlobStorage(storage: BlobStorage): void {
  it('returns what was put under a name', async () => {
    await storage.put('indicator-1/batch-1.csv', streamOf('area_code,value\nE92000001,83.8\n'));

    const content = await text(await storage.get('indicator-1/batch-1.csv'));

    expect(content).toBe('area_code,value\nE92000001,83.8\n');
  });

  it('refuses to overwrite a name and keeps the first content', async () => {
    await storage.put('indicator-1/batch-2.csv', streamOf('first'));

    await expect(storage.put('indicator-1/batch-2.csv', streamOf('second'))).rejects.toThrow(
      BlobExistsError,
    );
    expect(await text(await storage.get('indicator-1/batch-2.csv'))).toBe('first');
  });

  it('throws BlobNotFoundError for a name never put', async () => {
    await expect(storage.get('indicator-1/missing.csv')).rejects.toThrow(BlobNotFoundError);
  });

  it('deletes a blob, after which the name is free again', async () => {
    await storage.put('indicator-1/batch-3.csv', streamOf('old'));

    await storage.delete('indicator-1/batch-3.csv');

    await expect(storage.get('indicator-1/batch-3.csv')).rejects.toThrow(BlobNotFoundError);
    await storage.put('indicator-1/batch-3.csv', streamOf('new'));
    expect(await text(await storage.get('indicator-1/batch-3.csv'))).toBe('new');
  });

  it('answers a ping while its container is there', async () => {
    await expect(storage.ping()).resolves.toBeUndefined();
  });

  it('deletes a name never put without complaint', async () => {
    await expect(storage.delete('indicator-1/never.csv')).resolves.toBeUndefined();
  });

  it('rejects and stores nothing when the source fails', async () => {
    const failure = new Error('connection reset');

    await expect(storage.put('indicator-1/batch-4.csv', streamCutShort(failure))).rejects.toBe(
      failure,
    );

    await expect(storage.get('indicator-1/batch-4.csv')).rejects.toThrow(BlobNotFoundError);
    await storage.put('indicator-1/batch-4.csv', streamOf('retried'));
    expect(await text(await storage.get('indicator-1/batch-4.csv'))).toBe('retried');
  });

  it('rejects and stores nothing when the source closes before it ends', async () => {
    await expect(storage.put('indicator-1/batch-5.csv', streamCutShort())).rejects.toMatchObject({
      code: 'ERR_STREAM_PREMATURE_CLOSE',
    });

    await expect(storage.get('indicator-1/batch-5.csv')).rejects.toThrow(BlobNotFoundError);
  });
}
