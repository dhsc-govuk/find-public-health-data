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
  updateFrequency: 'annually',
  noFixedFrequencyReason: null,
  noLongerUpdatedReason: null,
  updateFrequencyText: 'Academic year.\nPublished in winter.',
};

describe('update frequency route', () => {
  it('loads the original frequency text for editing', async () => {
    const api = createFakeApiClient({ [`GET ${path}`]: { answers, version: SHOWN_VERSION } });
    const context = new RouterContextProvider();
    context.set(apiContext, api);

    expect(await loader({ context, params: { id } } as never)).toMatchObject({
      values: { ...answers, noFixedFrequencyReason: '', noLongerUpdatedReason: '' },
    });
  });

  it.each(['Academic year.\nPublished in winter.', ''])(
    'saves the optional frequency description %j',
    async (updateFrequencyText) => {
      const api = createFakeApiClient({
        [`PUT ${path}`]: { answers: { ...answers, updateFrequencyText }, version: SHOWN_VERSION },
      });
      const context = new RouterContextProvider();
      context.set(apiContext, api);
      const values = {
        ...answers,
        noFixedFrequencyReason: '',
        noLongerUpdatedReason: '',
        updateFrequencyText,
      };
      const response = await action({
        context,
        params: { id },
        request: new Request(`https://internal.test/publish/indicators/${id}/update-frequency`, {
          method: 'POST',
          body: new URLSearchParams({ ...values, version: SHOWN_VERSION }),
        }),
      } as never);

      expect(response).toBeInstanceOf(Response);
      expect((response as Response).headers.get('Location')).toBe(
        `/publish/indicators/${id}/task-list`,
      );
      expect(api.calls).toContainEqual({
        method: 'PUT',
        path,
        body: { answers: values, version: SHOWN_VERSION },
      });
    },
  );
});
