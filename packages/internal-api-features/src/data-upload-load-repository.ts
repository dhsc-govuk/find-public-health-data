import { type Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { type Database, dimensionKey, schema } from '@fphd/db';
import {
  type Actor,
  type AuditEntry,
  changesBetween,
  recordAudit,
  rowOf,
} from '@fphd/db/audit-log';
import type { PendingQuery, TransactionSql } from 'postgres';

import { type DataTableEvent, readDataTable } from './data-table.ts';
import { createProblemTally } from './data-table-problems.ts';
import type { DataTableReferences, DataTableRow } from './data-table-rows.ts';
import { DATA_TABLE_PROBLEM_ITEMS, type DataTableProblem } from './data-upload-contract.ts';
import { loadDataTableReferences } from './data-upload-repository.ts';
import { elapsedMs, TimedUploadError, timed, type UploadTimings } from './data-upload-timings.ts';

const { uploadBatch } = schema;

// Scopes the per-draft upload locks within the two-key advisory lock space.
const UPLOAD_LOCK_NAMESPACE = 0x75706c64; // 'upld'

/** A stored file about to be processed into the batch named by `batchId`. */
export interface DataUpload {
  batchId: string;
  indicatorId: string;
  blobName: string;
  originalFilename: string;
  byteSize: number;
  sha256: string;
  actor: Actor;
}

export type ProcessDataUploadResult = (
  | { ok: true; rowCount: number; deletedBlobNames: string[] }
  | { ok: false; reason: 'invalid'; problems: DataTableProblem[]; deletedBlobNames: string[] }
  | { ok: false; reason: 'locked' | 'no_draft' }
) & { timings: UploadTimings };

const STAGED_COLUMNS = [
  'line',
  'area_id',
  'from_date',
  'to_date',
  'value',
  'count',
  'numerator',
  'denominator',
  'lower_ci_95',
  'upper_ci_95',
  'lower_ci_998',
  'upper_ci_998',
  'sex_id',
  'age_id',
  'category_id',
  'note_type_id',
  'dimension_key',
] as const;

/** A row in COPY's text format. Every value is an id, a date or a validated number. */
function stagedLine(row: DataTableRow): string {
  const dimensionIds = [row.sexId, row.ageId, row.categoryId].filter((id) => id !== null);
  const values = [
    String(row.line),
    row.areaId,
    row.fromDate,
    row.toDate,
    row.value,
    row.count,
    row.numerator,
    row.denominator,
    row.lower_ci_95,
    row.upper_ci_95,
    row.lower_ci_998,
    row.upper_ci_998,
    row.sexId,
    row.ageId,
    row.categoryId,
    row.noteTypeId,
    dimensionKey(dimensionIds),
  ];
  return `${values.map((value) => value ?? '\\N').join('\t')}\n`;
}

// Rows go to the database in chunks of about this many characters rather than one write each.
const COPY_CHUNK = 64 * 1024;

/**
 * Stores the file's rows under a new batch and points the draft at it, in one transaction
 * under a lock per draft, so concurrent uploads queue. A refused file keeps its batch, marked
 * failed with its problems, and loads nothing. Either way the uploads it replaces are deleted
 * (see deleteEarlierBatches) and their blob names returned for deleting after commit. Answers
 * how long each stage took; a failure part way throws `TimedUploadError` with the stages reached.
 */
export async function processDataUpload(
  db: Database,
  upload: DataUpload,
  openFile: () => Promise<Readable>,
  signal: AbortSignal,
): Promise<ProcessDataUploadResult> {
  const references = await loadDataTableReferences(db);
  let finished = 0;

  try {
    const result = await db.$client.begin(async (tx) => {
      const loaded = await loadInTransaction(tx, upload, openFile, signal, references);
      finished = performance.now();
      return loaded;
    });
    return { ...result, timings: { ...result.timings, commitMs: elapsedMs(finished) } };
  } catch (error) {
    const timings = error instanceof TimedUploadError ? error.timings : {};
    const cause = error instanceof TimedUploadError ? error.cause : error;
    if (cause instanceof DraftGoneError) return { ok: false, reason: cause.reason, timings };
    throw error instanceof TimedUploadError ? error : new TimedUploadError(timings, error);
  }
}

/** The draft stopped being an editable draft while its upload loaded, so nothing is kept. */
class DraftGoneError extends Error {
  readonly reason: 'locked' | 'no_draft';

  constructor(reason: 'locked' | 'no_draft') {
    super('The draft was no longer an editable draft when its upload finished loading');
    this.name = 'DraftGoneError';
    this.reason = reason;
  }
}

/**
 * The refusal of a load by the version it loaded into. A version still unpublished refused it for
 * being locked, even if withdrawn since; one published or deleted has no draft to give.
 */
async function draftGone(tx: TransactionSql, versionId: string): Promise<DraftGoneError> {
  const [draft] = await tx`
    SELECT 1 FROM indicator_version WHERE id = ${versionId} AND status IN ${tx(schema.UNPUBLISHED_VERSION_STATUSES)}`;
  return new DraftGoneError(draft === undefined ? 'no_draft' : 'locked');
}

/** The transaction's work, answering how long each stage took or failing with the stages reached. */
async function loadInTransaction(
  tx: TransactionSql,
  upload: DataUpload,
  openFile: () => Promise<Readable>,
  signal: AbortSignal,
  references: DataTableReferences,
): Promise<ProcessDataUploadResult> {
  let timings: UploadTimings = {};
  const time = async <T>(stage: keyof UploadTimings, step: () => Promise<T>): Promise<T> => {
    const [result, ms] = await timed(step);
    timings = { ...timings, [stage]: ms };
    return result;
  };

  try {
    await time(
      'lockWaitMs',
      () =>
        tx`SELECT pg_advisory_xact_lock(${UPLOAD_LOCK_NAMESPACE}, hashtext(${upload.indicatorId}))`,
    );

    // No row lock: the upload lock queues the only other writer of the pointer, and section
    // saves on the draft carry on while the file loads.
    const [draft] = await tx<{ id: string; isLocked: boolean }[]>`
      SELECT id, is_locked AS "isLocked"
      FROM indicator_version
      WHERE indicator_id = ${upload.indicatorId} AND status IN ${tx(schema.UNPUBLISHED_VERSION_STATUSES)}`;

    if (draft === undefined) return { ok: false, reason: 'no_draft', timings };
    if (draft.isLocked) return { ok: false, reason: 'locked', timings };

    await tx`
      INSERT INTO upload_batch
        (id, indicator_id, indicator_version_id, original_filename, uploaded_by, blob_name, byte_size, sha256)
      VALUES (${upload.batchId}, ${upload.indicatorId}, ${draft.id}, ${upload.originalFilename},
        ${upload.actor.userId}, ${upload.blobName}, ${upload.byteSize}, ${upload.sha256})`;

    const staged = await time('stageMs', async () =>
      stageRows(tx, readDataTable(await openFile(), references), signal),
    );
    const duplicates = await time('duplicatesMs', () => duplicateRows(tx, signal));
    const problems = [...staged.problems, ...duplicates];

    if (problems.length > 0) {
      // Drizzle's client passes json parameters through unserialised, so they are sent as text.
      const [refused] = await tx<BatchRow[]>`
        UPDATE upload_batch
        SET status = 'failed', validation_result = ${JSON.stringify(problems)}::jsonb, column_names = ${staged.columnNames}
        WHERE id = ${upload.batchId}
        RETURNING to_jsonb(new) AS row`;
      // Held until commit, so the version cannot stop being a draft before the failure is kept.
      const [stillDraft] = await tx`
        SELECT id FROM indicator_version
        WHERE id = ${draft.id} AND status IN ${tx(schema.UNPUBLISHED_VERSION_STATUSES)} AND NOT is_locked FOR SHARE`;
      if (stillDraft === undefined) throw await draftGone(tx, draft.id);
      const deleted = await time('deleteEarlierMs', () =>
        deleteEarlierBatches(tx, draft.id, upload.batchId, 'failed', signal),
      );
      await recordAudit(tx, upload.actor, batchEntries('upload_batch.refused', refused, deleted));
      signal.throwIfAborted();
      return {
        ok: false,
        reason: 'invalid',
        problems,
        deletedBlobNames: blobNames(deleted),
        timings,
      };
    }

    const inserts = await time('insertMs', () => loadStagedRows(tx, upload, signal));
    timings = { ...timings, ...inserts };
    const [loaded] = await tx<BatchRow[]>`
      UPDATE upload_batch
      SET status = 'processed', row_count = ${staged.rowCount}, column_names = ${staged.columnNames}
      WHERE id = ${upload.batchId}
      RETURNING to_jsonb(new) AS row`;
    const pointed = await tx`
      UPDATE indicator_version
      SET upload_batch_id = ${upload.batchId}, data_table_confirmed_at = NULL,
        updated_at = now(), updated_by = ${upload.actor.userId}
      WHERE id = ${draft.id} AND status IN ${tx(schema.UNPUBLISHED_VERSION_STATUSES)} AND NOT is_locked`;
    if (pointed.count === 0) throw await draftGone(tx, draft.id);

    const deleted = await time('deleteEarlierMs', () =>
      deleteEarlierBatches(tx, draft.id, upload.batchId, 'all', signal),
    );
    await recordAudit(tx, upload.actor, batchEntries('upload_batch.loaded', loaded, deleted));
    // Abandoned after its last statement, the upload still rolls back rather than commit.
    signal.throwIfAborted();

    return { ok: true, rowCount: staged.rowCount, deletedBlobNames: blobNames(deleted), timings };
  } catch (error) {
    throw new TimedUploadError(timings, error);
  }
}

/** Streams the readable rows into a temporary table and tallies everything wrong with the rest. */
export async function stageRows(
  tx: TransactionSql,
  events: AsyncIterable<DataTableEvent>,
  signal: AbortSignal,
): Promise<{ rowCount: number; columnNames: string[]; problems: DataTableProblem[] }> {
  await tx`
    CREATE TEMPORARY TABLE upload_row (
      id uuid NOT NULL DEFAULT uuidv7(),
      line integer NOT NULL,
      area_id uuid NOT NULL,
      from_date date NOT NULL,
      to_date date NOT NULL,
      value double precision,
      count double precision,
      numerator double precision,
      denominator double precision,
      lower_ci_95 double precision,
      upper_ci_95 double precision,
      lower_ci_998 double precision,
      upper_ci_998 double precision,
      sex_id uuid,
      age_id uuid,
      category_id uuid,
      note_type_id uuid,
      dimension_key text NOT NULL
    ) ON COMMIT DROP`;

  const copy = await tx`COPY upload_row (${tx(STAGED_COLUMNS)}) FROM STDIN`.writable();
  const tally = createProblemTally();
  let rowCount = 0;
  let columnNames: string[] = [];

  await pipeline(
    events,
    async function* (source: AsyncIterable<DataTableEvent>) {
      let chunk = '';
      for await (const event of source) {
        if (event.kind === 'columns') {
          columnNames = event.names;
        } else if (event.kind === 'finding') {
          tally.add(event.finding);
        } else {
          rowCount += 1;
          chunk += stagedLine(event.row);
          if (chunk.length >= COPY_CHUNK) {
            yield chunk;
            chunk = '';
          }
        }
      }
      if (chunk !== '') yield chunk;
    },
    endedUnawaited(copy),
    { signal },
  );

  // Runs once the COPY has, so it fails if the server refused the rows.
  try {
    await tx`SELECT 1`;
  } catch (error) {
    throw new Error('The rows could not be copied into the staging table', { cause: error });
  }

  return { rowCount, columnNames, problems: tally.problems() };
}

/**
 * Writes through to a COPY stream and ends it without waiting for it to finish: postgres.js
 * drops a refusal the server sends after the last write, and the stream then never finishes.
 */
function endedUnawaited(copy: Writable): Writable {
  const writer = new Writable({
    write(chunk, _encoding, callback) {
      copy.write(chunk, callback);
    },
    final(callback) {
      copy.end();
      callback();
    },
    destroy(error, callback) {
      // An abandoned upload fails the COPY; a finished one leaves it be.
      if (error !== null) copy.destroy(error);
      callback(error);
    },
  });
  copy.on('error', (error) => writer.destroy(error));
  return writer;
}

/**
 * Runs a statement that an abandoned upload cancels on the server, so a long insert or delete
 * stops and the transaction rolls back rather than running to its end first.
 */
export async function cancellable<T extends readonly (object | undefined)[]>(
  signal: AbortSignal,
  query: PendingQuery<T>,
): Promise<T> {
  signal.throwIfAborted();
  const cancel = () => {
    query.cancel();
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    return await query;
  } finally {
    signal.removeEventListener('abort', cancel);
  }
}

/** Rows repeating an earlier row's area, period and dimension values: the natural key. */
async function duplicateRows(tx: TransactionSql, signal: AbortSignal): Promise<DataTableProblem[]> {
  const query = tx<{ line: number; total: string }[]>`
    SELECT line, count(*) OVER () AS total
    FROM (
      SELECT line, row_number() OVER (
        PARTITION BY area_id, from_date, to_date, dimension_key ORDER BY line
      ) AS occurrence
      FROM upload_row
    ) r
    WHERE occurrence > 1
    ORDER BY line
    LIMIT ${DATA_TABLE_PROBLEM_ITEMS}`;
  const repeats = await cancellable(signal, query);

  const [first] = repeats;
  if (first === undefined) return [];

  return [
    {
      code: 'duplicate_rows',
      items: repeats.map(({ line }) => String(line)),
      count: Number(first.total),
    },
  ];
}

async function loadStagedRows(
  tx: TransactionSql,
  upload: DataUpload,
  signal: AbortSignal,
): Promise<Pick<UploadTimings, 'observationMs' | 'dimensionMs' | 'noteMs'>> {
  const observations = tx`
    INSERT INTO observation (
      id, indicator_id, area_id, from_date, to_date, value, count, numerator, denominator,
      lower_ci_95, upper_ci_95, lower_ci_998, upper_ci_998, upload_batch_id, dimension_key
    )
    SELECT
      id, ${upload.indicatorId}, area_id, from_date, to_date, value, count, numerator, denominator,
      lower_ci_95, upper_ci_95, lower_ci_998, upper_ci_998, ${upload.batchId}, dimension_key
    FROM upload_row`;
  const dimensions = tx`
    INSERT INTO observation_dimension (observation_id, dimension_value_id, dimension_type_id)
    SELECT r.id, dv.id, dv.dimension_type_id
    FROM upload_row r
    CROSS JOIN LATERAL (VALUES (r.sex_id), (r.age_id), (r.category_id)) AS v (id)
    JOIN dimension_value dv ON dv.id = v.id`;
  const notes = tx`
    INSERT INTO observation_note (observation_id, note_type_id)
    SELECT id, note_type_id FROM upload_row WHERE note_type_id IS NOT NULL`;

  // Each is sent only when awaited, so they run in turn.
  const [, observationMs] = await timed(() => cancellable(signal, observations));
  const [, dimensionMs] = await timed(() => cancellable(signal, dimensions));
  const [, noteMs] = await timed(() => cancellable(signal, notes));
  return { observationMs, dimensionMs, noteMs };
}

/** A batch row as the database gives it in JSON, for the audit log. */
type BatchRow = { row: Record<string, unknown> };

/**
 * The entries for an upload: its own batch, every column after, and each batch it replaced,
 * every column before. The batch names its indicator and version, so their histories find it.
 */
function batchEntries(
  action: 'upload_batch.loaded' | 'upload_batch.refused',
  batch: BatchRow | undefined,
  deleted: readonly BatchRow[],
): AuditEntry[] {
  if (batch === undefined) throw new Error(`${action} wrote no batch`);

  return [
    {
      action,
      entityId: String(batch.row.id),
      changes: changesBetween(null, rowOf(uploadBatch, batch.row)),
    },
    ...deleted.map(({ row }) => ({
      action: 'upload_batch.deleted' as const,
      entityId: String(row.id),
      changes: changesBetween(rowOf(uploadBatch, row), null),
    })),
  ];
}

function blobNames(deleted: readonly BatchRow[]): string[] {
  return deleted.flatMap(({ row }) => (typeof row.blob_name === 'string' ? [row.blob_name] : []));
}

/**
 * Deletes the draft's earlier uploads, with their rows, now a newer one replaces them: every one
 * after a load, the failed ones after a failure. A batch uploaded to another version, or one any
 * version points at, such as the published batch an update draft started from, is kept. Answers
 * the deleted batches, whose blobs are deleted after commit.
 */
async function deleteEarlierBatches(
  tx: TransactionSql,
  draftId: string,
  newBatchId: string,
  which: 'all' | 'failed',
  signal: AbortSignal,
): Promise<BatchRow[]> {
  const earlier = await tx<{ id: string }[]>`
    SELECT id
    FROM upload_batch b
    WHERE b.indicator_version_id = ${draftId}
      AND b.id <> ${newBatchId}
      ${which === 'failed' ? tx`AND b.status = 'failed'` : tx``}
      AND NOT EXISTS (SELECT 1 FROM indicator_version v WHERE v.upload_batch_id = b.id)`;

  if (earlier.length === 0) return [];

  const ids = earlier.map(({ id }) => id);
  await cancellable(
    signal,
    tx`DELETE FROM observation WHERE upload_batch_id = ANY(${ids}::uuid[])`,
  );
  return cancellable(
    signal,
    tx<BatchRow[]>`
      DELETE FROM upload_batch WHERE id = ANY(${ids}::uuid[])
      RETURNING to_jsonb(old) AS row`,
  );
}
