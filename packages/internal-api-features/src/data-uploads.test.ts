import { createServer, request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Readable } from 'node:stream';
import { text } from 'node:stream/consumers';
import { request } from '@fphd/express/testing';
import { BlobNotFoundError, type BlobStorage } from '@fphd/internal-storage';
import { createFakeBlobStorage } from '@fphd/internal-storage/testing';
import type { Logger } from '@fphd/logger';
import { createCapturingLogger } from '@fphd/logger/testing';
import { describe, expect, it, vi } from 'vitest';

import { DATA_TABLE_MESSAGES } from './data-upload-contract.ts';
import type { DataUpload } from './data-upload-load-repository.ts';
import type { UploadDraftRow } from './data-upload-repository.ts';
import { dataUploadsRouter, findUploadDraft } from './data-uploads.ts';
import type { InternalDataUploadRepository } from './repositories.ts';
import {
  createFakeInternalRepositories,
  createRouterTestApp,
  handlerLogLines,
  inTestTeam,
  testActor,
  testSessionCookie,
  testSessionVerifier,
} from './testing.ts';

const INDICATOR = '00000000-0000-7000-8000-000000000001';
const DRAFT = '00000000-0000-7000-8000-000000000002';
const FRESH_DRAFT = '00000000-0000-7000-8000-000000000004';
const EDITABLE = { id: DRAFT, isLocked: false };
const LOCKED = { id: DRAFT, isLocked: true };
const UPLOADS = `/api/internal/indicators/${INDICATOR}/data-uploads`;
const CSV = 'area_code,period_start,period_end,value\nE92000001,2019-04-01,2020-03-31,83.8\n';

const PROBLEMS = [{ code: 'unmatched_area_codes' as const, items: ['E99999999'], count: 1 }];

function createTestApp(
  overrides: Partial<InternalDataUploadRepository> = {},
  storage: BlobStorage = createFakeBlobStorage(),
  logger?: Logger,
) {
  const { dataUploads } = createFakeInternalRepositories({
    dataUploads: { findDraft: async () => EDITABLE, ...overrides },
  });

  return createRouterTestApp(
    dataUploadsRouter(dataUploads, inTestTeam, storage, testSessionVerifier),
    logger,
  );
}

function publisherCookie(roles: readonly string[] = ['internal', 'publisher']) {
  return testSessionCookie(roles);
}

async function upload(app: ReturnType<typeof createTestApp>, content = CSV, filename = 'data.csv') {
  return request(app)
    .post(UPLOADS)
    .set('Cookie', await publisherCookie())
    .attach('dataTable', Buffer.from(content), filename);
}

/** The upload `process` was given, with the content its file opens to. */
async function processedUpload(process: ReturnType<typeof vi.fn>) {
  const [upload, openFile] = process.mock.calls[0] as [DataUpload, () => Promise<Readable>];
  return { upload, content: await text(await openFile()) };
}

describe('findUploadDraft', () => {
  function lookUp(draft: UploadDraftRow | null | undefined, rawId: unknown = INDICATOR) {
    const { dataUploads } = createFakeInternalRepositories({
      dataUploads: { findDraft: async () => draft },
    });
    return findUploadDraft(dataUploads, rawId);
  }

  it('finds the draft of the indicator the id names', async () => {
    expect(await lookUp(EDITABLE)).toEqual({ ok: true, indicatorId: INDICATOR, draftId: DRAFT });
  });

  it('answers 400 for an id that is not one', async () => {
    expect(await lookUp(EDITABLE, 'not-an-id')).toEqual({
      ok: false,
      status: 400,
      body: { error: 'invalid_id' },
    });
  });

  it.each([
    [undefined, 'not_found'],
    [null, 'no_draft'],
  ])('answers 404 when the draft is %s', async (draft, error) => {
    expect(await lookUp(draft)).toEqual({ ok: false, status: 404, body: { error } });
  });

  it('answers 409 when the draft is locked', async () => {
    expect(await lookUp(LOCKED)).toEqual({ ok: false, status: 409, body: { error: 'locked' } });
  });
});

describe('POST /api/internal/indicators/:id/data-uploads', () => {
  it('rejects a signed-in non-publisher', async () => {
    const response = await request(createTestApp())
      .post(UPLOADS)
      .set('Cookie', await publisherCookie(['internal']))
      .attach('dataTable', Buffer.from(CSV), 'data.csv');

    expect(response.status).toBe(403);
  });

  it('answers 400 for an id that is not one', async () => {
    const response = await request(createTestApp())
      .post('/api/internal/indicators/not-an-id/data-uploads')
      .set('Cookie', await publisherCookie())
      .attach('dataTable', Buffer.from(CSV), 'data.csv');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_id' });
  });

  it.each([
    [undefined, 'not_found'],
    [null, 'no_draft'],
  ])('answers 404 when the draft is %s, storing nothing', async (draft, error) => {
    const storage = createFakeBlobStorage();
    const put = vi.spyOn(storage, 'put');

    const response = await upload(createTestApp({ findDraft: async () => draft }, storage));

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error });
    expect(put).not.toHaveBeenCalled();
  });

  it('answers 409 for a locked draft, storing nothing', async () => {
    const storage = createFakeBlobStorage();
    const put = vi.spyOn(storage, 'put');

    const response = await upload(createTestApp({ findDraft: async () => LOCKED }, storage));

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'locked' });
    expect(put).not.toHaveBeenCalled();
  });

  it('stores the file, loads it as the signed-in user and answers with the batch', async () => {
    const storage = createFakeBlobStorage();
    const process = vi.fn().mockResolvedValue({ ok: true, rowCount: 1, deletedBlobNames: [] });

    const response = await upload(createTestApp({ process }, storage), CSV, 'life.csv');

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ id: expect.any(String), rowCount: 1 });
    const { upload: given, content } = await processedUpload(process);
    expect(given).toEqual({
      batchId: response.body.id,
      indicatorId: INDICATOR,
      blobName: `${INDICATOR}/${response.body.id}.csv`,
      originalFilename: 'life.csv',
      byteSize: Buffer.byteLength(CSV),
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      actor: testActor(response),
    });
    expect(content).toBe(CSV);
  });

  it('deletes the blobs of the uploads it replaced, and logs the upload', async () => {
    const storage = createFakeBlobStorage();
    await storage.put(`${INDICATOR}/old.csv`, Readable.from(['old']));
    const { logger, lines } = createCapturingLogger('internal-api');
    const process = vi
      .fn()
      .mockResolvedValue({ ok: true, rowCount: 1, deletedBlobNames: [`${INDICATOR}/old.csv`] });

    const response = await upload(createTestApp({ process }, storage, logger));

    await expect
      .poll(() => storage.get(`${INDICATOR}/old.csv`).catch((error) => error))
      .toBeInstanceOf(BlobNotFoundError);
    expect(await handlerLogLines(lines)).toEqual([
      expect.objectContaining({
        msg: 'Data table uploaded',
        indicatorId: INDICATOR,
        uploadBatchId: response.body.id,
        rowCount: 1,
      }),
    ]);
  });

  it('logs a replaced blob it could not delete, by name, having answered', async () => {
    const storage: BlobStorage = {
      ...createFakeBlobStorage(),
      delete: async () => {
        throw new Error('storage is down');
      },
    };
    const { logger, lines } = createCapturingLogger('internal-api');
    const process = vi
      .fn()
      .mockResolvedValue({ ok: true, rowCount: 1, deletedBlobNames: [`${INDICATOR}/old.csv`] });

    const response = await upload(createTestApp({ process }, storage, logger));

    expect(response.status).toBe(201);
    await expect
      .poll(async () => (await handlerLogLines(lines)).map(({ msg }) => msg))
      .toContain('Blob not deleted');
    expect(lines).toContainEqual(
      expect.objectContaining({ level: 40, blobName: `${INDICATOR}/old.csv` }),
    );
  });

  it('answers 422 with the problems, keeping the file the failed batch records', async () => {
    const storage = createFakeBlobStorage();
    const { logger, lines } = createCapturingLogger('internal-api');
    const process = vi.fn().mockResolvedValue({
      ok: false,
      reason: 'invalid',
      problems: PROBLEMS,
      deletedBlobNames: [],
    });

    const response = await upload(createTestApp({ process }, storage, logger));

    expect(response.status).toBe(422);
    expect(response.body).toEqual({
      error: 'invalid_data_table',
      id: expect.any(String),
      problems: PROBLEMS,
    });
    expect(await text(await storage.get(`${INDICATOR}/${response.body.id}.csv`))).toBe(CSV);
    expect(await handlerLogLines(lines)).toEqual([
      expect.objectContaining({ msg: 'Data table refused', problems: ['unmatched_area_codes'] }),
    ]);
  });

  it('deletes the blobs of the earlier failed uploads a refused one replaces', async () => {
    const storage = createFakeBlobStorage();
    await storage.put(`${INDICATOR}/failed.csv`, Readable.from(['failed']));
    const process = vi.fn().mockResolvedValue({
      ok: false,
      reason: 'invalid',
      problems: PROBLEMS,
      deletedBlobNames: [`${INDICATOR}/failed.csv`],
    });

    const response = await upload(createTestApp({ process }, storage));

    expect(response.status).toBe(422);
    await expect
      .poll(() => storage.get(`${INDICATOR}/failed.csv`).catch((error) => error))
      .toBeInstanceOf(BlobNotFoundError);
  });

  it.each([
    ['not a CSV', CSV, 'data.xlsx', DATA_TABLE_MESSAGES.notCsv],
    ['empty', '', 'data.csv', DATA_TABLE_MESSAGES.empty],
  ])(
    'refuses a file that is %s as a field error, keeping nothing',
    async (_case, content, filename, message) => {
      const storage = createFakeBlobStorage();
      const deleted = vi.spyOn(storage, 'delete');
      const process = vi.fn();

      const response = await upload(createTestApp({ process }, storage), content, filename);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'validation_failed',
        fieldErrors: { dataTable: message },
      });
      expect(process).not.toHaveBeenCalled();
      const [blobName] = deleted.mock.calls[0] ?? [];
      await expect(storage.get(String(blobName))).rejects.toThrow(BlobNotFoundError);
    },
  );

  it('answers 404 and deletes the stored blob when the draft went while it loaded', async () => {
    const storage = createFakeBlobStorage();
    const deleted = vi.spyOn(storage, 'delete');
    const process = vi.fn().mockResolvedValue({ ok: false, reason: 'no_draft' });

    const response = await upload(createTestApp({ process }, storage));

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'no_draft' });
    expect(deleted).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`^${INDICATOR}/`)));
  });

  it('answers 404 when the draft went while it loaded and a fresh draft has been opened since', async () => {
    const process = vi.fn().mockResolvedValue({ ok: false, reason: 'no_draft' });
    const findDraft = vi
      .fn()
      .mockResolvedValueOnce(EDITABLE)
      .mockResolvedValue({ id: FRESH_DRAFT, isLocked: false });

    const response = await upload(createTestApp({ findDraft, process }));

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'no_draft' });
  });

  it('answers 409 and deletes the stored blob when the draft was locked while it loaded', async () => {
    const storage = createFakeBlobStorage();
    const deleted = vi.spyOn(storage, 'delete');
    const process = vi.fn().mockResolvedValue({ ok: false, reason: 'locked' });
    const findDraft = vi.fn().mockResolvedValueOnce(EDITABLE).mockResolvedValue(LOCKED);

    const response = await upload(createTestApp({ findDraft, process }, storage));

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'locked' });
    expect(deleted).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`^${INDICATOR}/`)));
  });

  it('answers 409 when the draft was locked while it loaded and has been withdrawn since', async () => {
    const process = vi.fn().mockResolvedValue({ ok: false, reason: 'locked' });

    const response = await upload(createTestApp({ process }));

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'locked' });
  });

  it('deletes the stored blob and fails when loading throws', async () => {
    const storage = createFakeBlobStorage();
    const deleted = vi.spyOn(storage, 'delete');
    const process = vi.fn().mockRejectedValue(new Error('database is down'));

    const response = await upload(createTestApp({ process }, storage));

    expect(response.status).toBe(500);
    const [blobName] = deleted.mock.calls[0] ?? [];
    await expect(storage.get(String(blobName))).rejects.toThrow(BlobNotFoundError);
  });
});

describe('an abandoned upload', () => {
  it('deletes its blob and logs the abandonment when the client goes', async () => {
    const storage = createFakeBlobStorage();
    const deleted = vi.spyOn(storage, 'delete');
    const { logger, lines } = createCapturingLogger('internal-api');
    let processing: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      processing = resolve;
    });
    const process = vi.fn(
      (_upload: DataUpload, _openFile: unknown, signal: AbortSignal) =>
        new Promise<never>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason));
          processing();
        }),
    );
    const server = createServer(createTestApp({ process }, storage, logger));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

    const client = httpRequest({
      host: '127.0.0.1',
      port: (server.address() as AddressInfo).port,
      method: 'POST',
      path: UPLOADS,
      headers: {
        cookie: await publisherCookie(),
        'content-type': 'multipart/form-data; boundary=b',
      },
    });
    client.on('error', () => {});
    client.end(
      `--b\r\nContent-Disposition: form-data; name="dataTable"; filename="data.csv"\r\n\r\n${CSV}\r\n--b--\r\n`,
    );
    await started;
    client.destroy();

    await expect
      .poll(async () => (await handlerLogLines(lines)).map(({ msg }) => msg))
      .toContain('Data table upload abandoned');
    const [blobName] = deleted.mock.calls[0] ?? [];
    await expect(storage.get(String(blobName))).rejects.toThrow(BlobNotFoundError);
    expect(lines).not.toContainEqual(expect.objectContaining({ level: 50 }));
    server.close();
  });
});

describe('GET /api/internal/indicators/:id/data-uploads/latest', () => {
  it('answers null before the draft has an upload', async () => {
    const response = await request(createTestApp({ findLatest: async () => undefined }))
      .get(`${UPLOADS}/latest`)
      .set('Cookie', await publisherCookie());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ latestUpload: null });
  });

  it("answers the draft's latest upload with its problems", async () => {
    const findLatest = vi.fn().mockResolvedValue({
      id: '00000000-0000-7000-8000-000000000003',
      status: 'failed',
      originalFilename: 'data.csv',
      uploadedAt: new Date('2026-10-09T10:00:00.000Z'),
      problems: PROBLEMS,
    });

    const response = await request(createTestApp({ findLatest }))
      .get(`${UPLOADS}/latest`)
      .set('Cookie', await publisherCookie());

    expect(findLatest).toHaveBeenCalledWith(DRAFT);
    expect(response.body).toEqual({
      latestUpload: {
        id: '00000000-0000-7000-8000-000000000003',
        status: 'failed',
        originalFilename: 'data.csv',
        uploadedAt: '2026-10-09T10:00:00.000Z',
        problems: PROBLEMS,
      },
    });
  });

  it('answers 409 for a locked draft', async () => {
    const response = await request(createTestApp({ findDraft: async () => LOCKED }))
      .get(`${UPLOADS}/latest`)
      .set('Cookie', await publisherCookie());

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'locked' });
  });

  it('answers 404 for an indicator with no draft', async () => {
    const response = await request(createTestApp({ findDraft: async () => null }))
      .get(`${UPLOADS}/latest`)
      .set('Cookie', await publisherCookie());

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'no_draft' });
  });
});
