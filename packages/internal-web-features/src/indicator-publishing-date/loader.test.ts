import { apiContext } from '@fphd/web-server/api-context';
import { createFakeApiClient } from '@fphd/web-server/testing';
import { RouterContextProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { indicatorDetail, SHOWN_VERSION } from '../testing.ts';
import { loadPublishingDate } from './loader.ts';

const id = '00000000-0000-7000-8000-000000000001';

const unanswered = {
  publishingDateDay: null,
  publishingDateMonth: null,
  publishingDateYear: null,
  fastTracked: null,
  fastTrackReason: null,
  publishingTimeHour: null,
  publishingTimeMinute: null,
};

function load(answers: Record<string, string | null>, indicatorStatus: 'new' | 'live' = 'new') {
  const provider = new RouterContextProvider();
  provider.set(
    apiContext,
    createFakeApiClient({
      [`GET /api/internal/indicators/${id}/publishing-date`]: { answers, version: SHOWN_VERSION },
      [`GET /api/internal/indicators/${id}`]: indicatorDetail({ id, indicatorStatus }),
    }),
  );

  return loadPublishingDate({
    context: provider,
    params: { id },
    request: new Request(`https://internal.test/publish/indicators/${id}/publishing-date`),
  } as never);
}

describe('loadPublishingDate', () => {
  it('offers 09:30 on a draft with no publishing date', async () => {
    expect((await load(unanswered)).values).toEqual({
      publishingDateDay: '',
      publishingDateMonth: '',
      publishingDateYear: '',
      fastTracked: '',
      fastTrackReason: '',
      publishingTimeHour: '09',
      publishingTimeMinute: '30',
    });
  });

  it('shows the saved date and time, and the reason a fast-tracked draft gives', async () => {
    const answers = {
      publishingDateDay: '4',
      publishingDateMonth: '1',
      publishingDateYear: '2027',
      fastTracked: 'yes',
      fastTrackReason: 'For a ministerial briefing.',
      publishingTimeHour: '15',
      publishingTimeMinute: '05',
    };

    expect(await load(answers)).toEqual({
      id,
      values: answers,
      version: SHOWN_VERSION,
      isUpdate: false,
    });
  });

  it('says whether the draft updates a live indicator', async () => {
    expect((await load(unanswered, 'live')).isUpdate).toBe(true);
  });
});
