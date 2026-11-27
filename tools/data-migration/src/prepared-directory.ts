import { lstat, mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

/**
 * Writes a new output directory through a temporary directory beside it, renamed into place only
 * when `write` succeeds and removed when it fails. An existing path, including a symlink alias of
 * an input, is refused rather than written over.
 */
export async function writePreparedDirectory(
  directory: string,
  write: (staged: string) => Promise<void>,
): Promise<void> {
  const output = resolve(directory);
  try {
    await lstat(output);
    throw new Error(`Output directory already exists: ${output}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await mkdir(dirname(output), { recursive: true });
  const staged = await mkdtemp(join(dirname(output), `.${basename(output)}-`));
  try {
    await write(staged);
    await rename(staged, output);
  } finally {
    await rm(staged, { recursive: true, force: true });
  }
}
