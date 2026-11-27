import { once } from 'node:events';
import { createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { finished } from 'node:stream/promises';
import { createGzip } from 'node:zlib';

import { sha256 } from '@fphd/db-operations';

export async function ensureDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

// postgres.js leaves its connection wedged if stream.pipeline() pauses a COPY TO STDOUT
// stream for backpressure, so the next query on it never returns. Reading the stream to
// the end with for await, and waiting for the gzip buffer to drain, avoids that.
export async function writeGzipped(source: AsyncIterable<Buffer>, path: string): Promise<void> {
  const gzip = createGzip({ level: 1 });
  const written = finished(gzip.pipe(createWriteStream(path)));
  try {
    for await (const chunk of source) {
      if (!gzip.write(chunk)) await once(gzip, 'drain');
    }
  } finally {
    gzip.end();
  }
  await written;
}

export async function fileRecord(path: string, file: string, rows: number) {
  const details = await stat(path);
  return { file, rows, bytes: details.size, sha256: await sha256(path) };
}
