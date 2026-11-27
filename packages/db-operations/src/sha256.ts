import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

/** The SHA-256 digest of a file's bytes, as lowercase hex, read as a stream. */
export async function sha256(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
