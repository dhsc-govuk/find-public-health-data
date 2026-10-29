import { describe, expect, it } from 'vitest';

import { readVersion, versionedAction } from './edit-version.ts';
import { SHOWN_VERSION } from './testing.ts';

const NEWER_VERSION = 'b'.repeat(64);

function post(body: Record<string, string>) {
  return {
    params: {},
    request: new Request('https://internal.test/form', {
      method: 'POST',
      body: new URLSearchParams(body),
    }),
  } as never;
}

describe('readVersion', () => {
  it('reads the version the form was shown, or nothing when it sent none', () => {
    const form = new FormData();

    expect(readVersion(form)).toBe('');
    form.set('version', SHOWN_VERSION);
    expect(readVersion(form)).toBe(SHOWN_VERSION);
  });
});

describe('versionedAction', () => {
  it('gives the action the form and the version it was shown', async () => {
    const action = versionedAction(async (_, { formData, version }) => ({
      values: { name: formData.get('name') },
      shown: version,
    }));

    await expect(action(post({ name: 'Typed', version: SHOWN_VERSION }))).resolves.toMatchObject({
      values: { name: 'Typed' },
      shown: SHOWN_VERSION,
    });
  });

  it('carries the version shown into the page it re-renders, however it re-renders it', async () => {
    const action = versionedAction(async () => ({ values: {}, fieldErrors: {} }));

    await expect(action(post({ version: SHOWN_VERSION }))).resolves.toEqual({
      values: {},
      fieldErrors: {},
      version: SHOWN_VERSION,
    });
  });

  it('carries a newer version a refusal gave instead', async () => {
    const action = versionedAction(async () => ({ values: {}, version: NEWER_VERSION }));

    await expect(action(post({ version: SHOWN_VERSION }))).resolves.toEqual({
      values: {},
      version: NEWER_VERSION,
    });
  });

  it('passes a response through', async () => {
    const response = new Response(null, { status: 302 });
    const action = versionedAction(async () => response);

    await expect(action(post({ version: SHOWN_VERSION }))).resolves.toBe(response);
  });
});
