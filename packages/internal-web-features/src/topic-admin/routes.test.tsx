// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { SHOWN_VERSION } from '../testing.ts';
import { handle as deleteHandle } from './delete-route.tsx';
import { handle as editHandle } from './edit-route.tsx';
import type { TopicAdminDetailWithLinkCount } from './loader.ts';
import { handle as newHandle } from './new-route.tsx';

const topic: TopicAdminDetailWithLinkCount = {
  id: '019a1b2c-3d4e-7f60-8a9b-0c1d2e3f4a5b',
  slug: 'smoking',
  createdAt: '2026-08-01T09:30:00.000Z',
  title: 'Smoking',
  description: 'About smoking.',
  linkedIndicatorCount: 0,
  updatedAt: '2026-09-01T09:30:00.000Z',
  version: SHOWN_VERSION,
};

describe('the topic admin routes', () => {
  it.each([
    ['adding', newHandle],
    ['editing', editHandle],
  ])('links back to the topic list from above the page when %s a topic', (_, handle) => {
    expect(handle.backHref).toBe('/manage/topics');
  });

  it('links back to editing the topic from above the delete confirmation', () => {
    if (typeof deleteHandle.backHref !== 'function') throw new Error('back link needs the loader');

    expect(deleteHandle.backHref({ topic })).toBe(`/manage/topics/${topic.id}`);
  });
});
