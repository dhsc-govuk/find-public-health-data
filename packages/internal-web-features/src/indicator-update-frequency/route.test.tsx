// @vitest-environment jsdom
import { apiContext } from '@fphd/web-server/api-context';
import { createFakeApiClient } from '@fphd/web-server/testing';
import { RouterContextProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { SHOWN_VERSION } from '../testing.ts';
import { action, loader } from './route.tsx';

const id = '00000000-0000-7000-8000-000000000001';
const path = `/api/internal/indicators/${id}/update-frequency`;
const answers = {
  updateFrequency: 'every-n-years',
  updateFrequencyYears: '3',
  updateFrequencyText: null,
  noFixedFrequencyReason: null,
  noLongerUpdatedReason: null,
};
const values = {
  ...answers,
  updateFrequencyText: '',
  noFixedFrequencyReason: '',
  noLongerUpdatedReason: '',
};

describe('update frequency route', () => {
  it('loads the number of years for editing', async () => {
    const api = createFakeApiClient({ [`GET ${path}`]: { answers, version: SHOWN_VERSION } });
    const context = new RouterContextProvider();
    context.set(apiContext, api);

    expect(await loader({ context, params: { id } } as never)).toMatchObject({ values });
  });

  it.each([
    values,
    {
      ...values,
      updateFrequency: 'other',
      updateFrequencyYears: '',
      updateFrequencyText: 'Academic year.\nPublished in winter.',
    },
  ])('saves the details of the answer %o', async (saved) => {
    const api = createFakeApiClient({
      [`PUT ${path}`]: { answers: saved, version: SHOWN_VERSION },
    });
    const context = new RouterContextProvider();
    context.set(apiContext, api);
    const response = await action({
      context,
      params: { id },
      request: new Request(`https://internal.test/publish/indicators/${id}/update-frequency`, {
        method: 'POST',
        body: new URLSearchParams({ ...saved, version: SHOWN_VERSION }),
      }),
    } as never);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).headers.get('Location')).toBe(
      `/publish/indicators/${id}/task-list`,
    );
    expect(api.calls).toContainEqual({
      method: 'PUT',
      path,
      body: { answers: saved, version: SHOWN_VERSION },
    });
  });
});
