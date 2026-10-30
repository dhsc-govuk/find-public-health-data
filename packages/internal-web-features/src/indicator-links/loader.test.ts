import type { ApiClient } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import { RouterContextProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { SHOWN_VERSION } from '../testing.ts';
import { linkFieldName } from './form.ts';
import { loadLinks, submitLinks } from './loader.ts';

const id = '00000000-0000-7000-8000-000000000001';
const sectionPath = `/api/internal/indicators/${id}/links`;

const commentary = { url: 'https://www.gov.uk/statistics', text: 'Statistical commentary' };
const fingertips = { url: 'https://fingertips.phe.org.uk/', text: 'Fingertips' };

function context(client: Partial<ApiClient>) {
  const provider = new RouterContextProvider();
  provider.set(apiContext, client as ApiClient);
  return provider;
}

function load(indicatorId: string, get: ApiClient['get']) {
  return loadLinks({
    context: context({ get }),
    params: { id: indicatorId },
    request: new Request(`https://internal.test/publish/indicators/${indicatorId}/links`),
  } as never);
}

function submit(
  fields: Record<string, string>,
  links: { url: string; text: string }[],
  put: ApiClient['put'],
) {
  const body = new URLSearchParams({ ...fields, version: SHOWN_VERSION });
  links.forEach(({ url, text }, index) => {
    body.set(linkFieldName(index, 'url'), url);
    body.set(linkFieldName(index, 'text'), text);
  });

  return submitLinks({
    context: context({ put }),
    params: { id },
    request: new Request(`https://internal.test/publish/indicators/${id}/links`, {
      method: 'POST',
      body,
    }),
  } as never);
}

function isRedirectToTaskList(outcome: unknown) {
  return (
    outcome instanceof Response &&
    outcome.status === 302 &&
    outcome.headers.get('location') === `/publish/indicators/${id}/task-list`
  );
}

describe('loadLinks', () => {
  it("fills the form with the draft's answers and nothing typed", async () => {
    const get = vi.fn().mockResolvedValue({
      answers: { hasLinks: 'yes', links: [commentary] },
      version: SHOWN_VERSION,
    });

    await expect(load(id, get)).resolves.toEqual({
      id,
      values: { hasLinks: 'yes', links: [commentary], linkUrl: '', linkText: '' },
      version: SHOWN_VERSION,
    });
    expect(get.mock.calls[0]?.[0]).toBe(sectionPath);
  });

  it('leaves an unanswered question unchosen', async () => {
    const get = vi
      .fn()
      .mockResolvedValue({ answers: { hasLinks: null, links: [] }, version: SHOWN_VERSION });

    await expect(load(id, get)).resolves.toMatchObject({ values: { hasLinks: '', links: [] } });
  });
});

describe('submitLinks', () => {
  it('adds a link without saving anything', async () => {
    const put = vi.fn();

    const outcome = await submit(
      { intent: 'add', hasLinks: 'yes', linkUrl: fingertips.url, linkText: fingertips.text },
      [commentary],
      put,
    );

    expect(outcome).toEqual({
      values: { hasLinks: 'yes', links: [commentary, fingertips], linkUrl: '', linkText: '' },
      fieldErrors: {},
      version: SHOWN_VERSION,
    });
    expect(put).not.toHaveBeenCalled();
  });

  it('removes a link without saving anything', async () => {
    const put = vi.fn();

    const outcome = await submit(
      { intent: 'remove-0', hasLinks: 'yes' },
      [commentary, fingertips],
      put,
    );

    expect(outcome).toMatchObject({
      values: { links: [fingertips] },
      fieldErrors: {},
      version: SHOWN_VERSION,
    });
    expect(put).not.toHaveBeenCalled();
  });

  it('saves the links on Continue and returns to the task list', async () => {
    const put = vi.fn().mockResolvedValue({ ok: true, data: {} });

    const outcome = await submit({ hasLinks: 'yes' }, [commentary, fingertips], put);

    expect(put.mock.calls[0]?.[0]).toBe(sectionPath);
    expect(put.mock.calls[0]?.[1]).toEqual({
      answers: { hasLinks: 'yes', links: [commentary, fingertips] },
      version: SHOWN_VERSION,
    });
    expect(outcome).toSatisfy(isRedirectToTaskList);
  });

  it('saves a link typed but not added along with the others on Continue', async () => {
    const put = vi.fn().mockResolvedValue({ ok: true, data: {} });

    await submit(
      { hasLinks: 'yes', linkUrl: fingertips.url, linkText: fingertips.text },
      [commentary],
      put,
    );

    expect(put.mock.calls[0]?.[1]).toEqual({
      answers: { hasLinks: 'yes', links: [commentary, fingertips] },
      version: SHOWN_VERSION,
    });
  });

  it('ignores a link typed beside "No"', async () => {
    const put = vi.fn().mockResolvedValue({ ok: true, data: {} });

    await submit({ hasLinks: 'no', linkUrl: 'not a url', linkText: '' }, [], put);

    expect(put.mock.calls[0]?.[1]).toEqual({
      answers: { hasLinks: 'no', links: [] },
      version: SHOWN_VERSION,
    });
  });

  it('saves nothing when the link typed is refused, keeping the page as sent', async () => {
    const put = vi.fn();
    const fields = { hasLinks: 'yes', linkUrl: fingertips.url, linkText: '' };

    const outcome = await submit(fields, [commentary], put);

    expect(outcome).toEqual({
      values: { ...fields, links: [commentary] },
      fieldErrors: { linkText: 'Enter link text' },
      version: SHOWN_VERSION,
    });
    expect(put).not.toHaveBeenCalled();
  });

  it('saves nothing while the answers are refused', async () => {
    const put = vi.fn();

    const outcome = await submit({ hasLinks: 'yes' }, [], put);

    expect(outcome).toEqual({
      values: { hasLinks: 'yes', links: [], linkUrl: '', linkText: '' },
      fieldErrors: { links: 'Add at least one link' },
      version: SHOWN_VERSION,
    });
    expect(put).not.toHaveBeenCalled();
  });

  it('shows what the API refused, keeping the page as sent', async () => {
    const put = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      error: { error: 'validation_failed', fieldErrors: { links: 'Refused by the API' } },
    });

    await expect(submit({ hasLinks: 'yes' }, [commentary], put)).resolves.toEqual({
      values: { hasLinks: 'yes', links: [commentary], linkUrl: '', linkText: '' },
      fieldErrors: { links: 'Refused by the API' },
      version: SHOWN_VERSION,
    });
  });
});
