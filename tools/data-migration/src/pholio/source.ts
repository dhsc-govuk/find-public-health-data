import mssql from 'mssql';

export type PholioRow = Record<string, unknown>;

const PAUSE_AT = 1_000;
const RESUME_AT = 100;

export async function connectToPholio(connectionString: string): Promise<mssql.ConnectionPool> {
  // The driver's 15-second limit covers a whole request, and streaming CoreDataSet takes minutes.
  const config = {
    ...mssql.ConnectionPool.parseConnectionString(connectionString),
    requestTimeout: 0,
  };
  return new mssql.ConnectionPool(config).connect();
}

export async function queryPholio<T extends object = PholioRow>(
  pool: mssql.ConnectionPool,
  query: string,
): Promise<T[]> {
  return (await pool.request().query(query)).recordset as T[];
}

/**
 * Streams a query's rows through a handler strictly in order, pausing SQL Server while the
 * handler falls behind, so a 33-million-row table is exported in bounded memory. The driver can
 * still deliver rows it has already buffered after a pause, so every row joins one queue.
 */
export async function streamPholio<T extends object = PholioRow>(
  pool: mssql.ConnectionPool,
  query: string,
  handle: (row: T) => Promise<void> | void,
): Promise<number> {
  const request = pool.request();
  request.stream = true;
  let rows = 0;
  let queued = 0;
  let paused = false;
  let failure: unknown;
  let queue: Promise<void> = Promise.resolve();
  await new Promise<void>((resolve, reject) => {
    const fail = (error: unknown) => {
      failure ??= error;
      request.cancel();
    };
    request.on('row', (row: T) => {
      rows += 1;
      queued += 1;
      if (queued >= PAUSE_AT && !paused) {
        paused = true;
        request.pause();
      }
      queue = queue
        .then(() => (failure ? undefined : handle(row)))
        .then(() => {
          queued -= 1;
          if (paused && queued <= RESUME_AT) {
            paused = false;
            request.resume();
          }
        }, fail);
    });
    request.on('error', (error: unknown) => reject(failure ?? error));
    request.on('done', () => {
      queue.then(() => (failure ? reject(failure) : resolve()), reject);
    });
    void request.query(query).catch((error: unknown) => reject(failure ?? error));
  });
  return rows;
}
