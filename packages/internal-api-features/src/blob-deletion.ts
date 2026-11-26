import type { BlobStorage } from '@fphd/internal-storage';
import type { Request } from 'express';

/**
 * Deletes a file nothing refers to any more. A file that fails to delete is logged by its name and
 * left in place, so it never fails the request whose work has been committed.
 */
export async function deleteBlob(
  request: Request,
  storage: BlobStorage,
  blobName: string,
): Promise<void> {
  await storage
    .delete(blobName)
    .catch((error: unknown) => request.log.warn({ err: error, blobName }, 'Blob not deleted'));
}
