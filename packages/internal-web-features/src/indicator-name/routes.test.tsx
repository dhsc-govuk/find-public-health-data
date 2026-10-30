// @vitest-environment jsdom
import { TEAM_IDS } from '@fphd/auth';
import type { IndicatorAdminDetail } from '@fphd/internal-api-features/contract';
import { describe, expect, it } from 'vitest';

import { SHOWN_VERSION } from '../testing.ts';
import { handle as editHandle } from './edit-route.tsx';
import { handle as newHandle } from './new-route.tsx';

const indicator: IndicatorAdminDetail = {
  id: '019a1b2c-3d4e-7f60-8a9b-0c1d2e3f4a5b',
  shortId: 90366,
  name: 'Life expectancy at birth',
  teamId: TEAM_IDS.teamA,
  publishedSlug: null,
  indicatorStatus: 'new',
  draftStatus: 'draft',
  draftLocked: false,
  draftSubmissionStatus: null,
  draftReviewers: [],
  draftSubmissionNumber: null,
  nameVersion: SHOWN_VERSION,
  actions: [],
  updatedAt: '2026-08-04T23:30:00.000Z',
};

describe('the indicator name routes', () => {
  it('links a new indicator back to the dashboard from above the page', () => {
    expect(newHandle.backHref).toBe('/dashboard');
  });

  it('links a draft being renamed back to its task list from above the page', () => {
    if (typeof editHandle.backHref !== 'function') throw new Error('back link needs the loader');

    expect(editHandle.backHref({ indicator })).toBe(
      `/publish/indicators/${indicator.id}/task-list`,
    );
  });
});
