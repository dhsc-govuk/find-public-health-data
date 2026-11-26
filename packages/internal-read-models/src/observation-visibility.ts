import { schema } from '@fphd/db';
import { and, eq, gte } from 'drizzle-orm';

export function visibleObservations(
  indicatorId: string,
  uploadBatchId: string,
  publishedFrom: string | null,
) {
  const { observation } = schema;
  return and(
    eq(observation.indicatorId, indicatorId),
    eq(observation.uploadBatchId, uploadBatchId),
    publishedFrom ? gte(observation.fromDate, publishedFrom) : undefined,
  );
}
