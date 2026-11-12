import { apiContext } from '@fphd/web-server/api-context';
import { createFakeApiClient } from '@fphd/web-server/testing';
import { RouterContextProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { indicatorDetail, SHOWN_VERSION } from '../testing.ts';
import { loadPublishingDate, publishingDateExample } from './loader.ts';

const id = '00000000-0000-7000-8000-000000000001';

const unanswered = {
  publishingDateDay: null,
  publishingDateMonth: null,
  publishingDateYear: null,
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
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2027-09-14T08:30:00.000Z'), toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('gives an example date from today', async () => {
    expect((await load(unanswered)).dateExample).toBe('9 11 2027');
  });

  it('offers 09:30 on a draft with no publishing date', async () => {
    expect((await load(unanswered)).values).toEqual({
      publishingDateDay: '',
      publishingDateMonth: '',
      publishingDateYear: '',
      publishingTimeHour: '09',
      publishingTimeMinute: '30',
    });
  });

  it('shows the saved date and time', async () => {
    const answers = {
      publishingDateDay: '4',
      publishingDateMonth: '1',
      publishingDateYear: '2027',
      publishingTimeHour: '15',
      publishingTimeMinute: '05',
    };

    expect(await load(answers)).toEqual({
      id,
      values: answers,
      version: SHOWN_VERSION,
      dateExample: '9 11 2027',
      isUpdate: false,
    });
  });

  it('says whether the draft updates a live indicator', async () => {
    expect((await load(unanswered, 'live')).isUpdate).toBe(true);
  });
});

describe('publishingDateExample', () => {
  it('gives the UK date twice the notice period ahead, as day, month and year', () => {
    // 00:30 BST on 15 September, still 14 September in UTC.
    expect(publishingDateExample(new Date('2027-09-14T23:30:00.000Z'))).toBe('10 11 2027');
  });
});
