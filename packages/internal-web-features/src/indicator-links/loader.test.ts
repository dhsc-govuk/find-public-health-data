import { apiContext } from '@fphd/web-server/api-context';
import { createFakeApiClient, type FakeApiClient, refused } from '@fphd/web-server/testing';
import { RouterContextProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { SHOWN_VERSION, savedSection } from '../testing.ts';
import { linkFieldName } from './form.ts';
import { loadLinks, submitLinks } from './loader.ts';

const id = '00000000-0000-7000-8000-000000000001';
const sectionPath = `/api/internal/indicators/${id}/links`;

const commentary = { url: 'https://www.gov.uk/statistics', text: 'Statistical commentary' };
const fingertips = { url: 'https://fingertips.phe.org.uk/', text: 'Fingertips' };

function context(api: FakeApiClient) {
  const provider = new RouterContextProvider();
  provider.set(apiContext, api);
  return provider;
}

function load(indicatorId: string, api: FakeApiClient) {
  return loadLinks({
    context: context(api),
    params: { id: indicatorId },
    request: new Request(`https://internal.test/publish/indicators/${indicatorId}/links`),
  } as never);
}

function submit(
  fields: Record<string, string>,
  links: { url: string; text: string }[],
  api: FakeApiClient,
) {
  const body = new URLSearchParams({ ...fields, version: SHOWN_VERSION });
  links.forEach(({ url, text }, index) => {
    body.set(linkFieldName(index, 'url'), url);
    body.set(linkFieldName(index, 'text'), text);
  });

  return submitLinks({
    context: context(api),
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
    const api = createFakeApiClient({
      [`GET ${sectionPath}`]: {
        answers: { hasLinks: 'yes', links: [commentary] },
        version: SHOWN_VERSION,
      },
    });

    await expect(load(id, api)).resolves.toEqual({
      id,
      values: { hasLinks: 'yes', links: [commentary], linkUrl: '', linkText: '' },
      version: SHOWN_VERSION,
    });
  });

  it('leaves an unanswered question unchosen', async () => {
    const api = createFakeApiClient({
      [`GET ${sectionPath}`]: { answers: { hasLinks: null, links: [] }, version: SHOWN_VERSION },
    });

    await expect(load(id, api)).resolves.toMatchObject({ values: { hasLinks: '', links: [] } });
  });
});

describe('submitLinks', () => {
  it('adds a link without saving anything', async () => {
    const api = createFakeApiClient();

    const outcome = await submit(
      { intent: 'add', hasLinks: 'yes', linkUrl: fingertips.url, linkText: fingertips.text },
      [commentary],
      api,
    );

    expect(outcome).toEqual({
      values: { hasLinks: 'yes', links: [commentary, fingertips], linkUrl: '', linkText: '' },
      fieldErrors: {},
      version: SHOWN_VERSION,
    });
    expect(api.calls).toEqual([]);
  });

  it('removes a link without saving anything', async () => {
    const api = createFakeApiClient();

    const outcome = await submit(
      { intent: 'remove-0', hasLinks: 'yes' },
      [commentary, fingertips],
      api,
    );

    expect(outcome).toMatchObject({
      values: { links: [fingertips] },
      fieldErrors: {},
      version: SHOWN_VERSION,
    });
    expect(api.calls).toEqual([]);
  });

  it('saves the links on Continue and returns to the task list', async () => {
    const api = createFakeApiClient({ [`PUT ${sectionPath}`]: savedSection });

    const outcome = await submit({ hasLinks: 'yes' }, [commentary, fingertips], api);

    expect(api.calls[0]?.body).toEqual({
      answers: { hasLinks: 'yes', links: [commentary, fingertips] },
      version: SHOWN_VERSION,
    });
    expect(outcome).toSatisfy(isRedirectToTaskList);
  });

  it('saves a link typed but not added along with the others on Continue', async () => {
    const api = createFakeApiClient({ [`PUT ${sectionPath}`]: savedSection });

    await submit(
      { hasLinks: 'yes', linkUrl: fingertips.url, linkText: fingertips.text },
      [commentary],
      api,
    );

    expect(api.calls[0]?.body).toEqual({
      answers: { hasLinks: 'yes', links: [commentary, fingertips] },
      version: SHOWN_VERSION,
    });
  });

  it('ignores a link typed beside "No"', async () => {
    const api = createFakeApiClient({ [`PUT ${sectionPath}`]: savedSection });

    await submit({ hasLinks: 'no', linkUrl: 'not a url', linkText: '' }, [], api);

    expect(api.calls[0]?.body).toEqual({
      answers: { hasLinks: 'no', links: [] },
      version: SHOWN_VERSION,
    });
  });

  it('saves nothing when the link typed is refused, keeping the page as sent', async () => {
    const api = createFakeApiClient();
    const fields = { hasLinks: 'yes', linkUrl: fingertips.url, linkText: '' };

    const outcome = await submit(fields, [commentary], api);

    expect(outcome).toEqual({
      values: { ...fields, links: [commentary] },
      fieldErrors: { linkText: 'Enter link text' },
      version: SHOWN_VERSION,
    });
    expect(api.calls).toEqual([]);
  });

  it('saves nothing while the answers are refused', async () => {
    const api = createFakeApiClient();

    const outcome = await submit({ hasLinks: 'yes' }, [], api);

    expect(outcome).toEqual({
      values: { hasLinks: 'yes', links: [], linkUrl: '', linkText: '' },
      fieldErrors: { links: 'Add at least one link' },
      version: SHOWN_VERSION,
    });
    expect(api.calls).toEqual([]);
  });

  it('shows what the API refused, keeping the page as sent', async () => {
    const api = createFakeApiClient({
      [`PUT ${sectionPath}`]: refused(400, {
        error: 'validation_failed',
        fieldErrors: { links: 'Refused by the API' },
      }),
    });

    await expect(submit({ hasLinks: 'yes' }, [commentary], api)).resolves.toEqual({
      values: { hasLinks: 'yes', links: [commentary], linkUrl: '', linkText: '' },
      fieldErrors: { links: 'Refused by the API' },
      version: SHOWN_VERSION,
    });
  });
});
