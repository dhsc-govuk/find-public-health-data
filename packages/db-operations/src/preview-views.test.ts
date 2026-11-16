import { describe, expect, it } from 'vitest';

import { type PublishedViewReads, planPreviewViews } from './preview-views.ts';

const HAND_WRITTEN = [
  'available_data',
  'indicator',
  'indicator_slug',
  'indicator_update_summary',
  'observation_range',
];

function view(name: string, reads: Partial<Omit<PublishedViewReads, 'name'>> = {}) {
  return {
    name,
    readsCurrentPublishedVersion: false,
    choosesVersions: false,
    readsVersionedData: false,
    ...reads,
  };
}

/** The published views with hand-written preview views, as they read today. */
const handWritten = HAND_WRITTEN.map((name) =>
  view(name, { choosesVersions: true, readsVersionedData: true }),
);

describe('planPreviewViews', () => {
  it('generates a preview of each view that chooses versions through current_published_version', () => {
    expect(
      planPreviewViews([
        ...handWritten,
        view('observation', { readsCurrentPublishedVersion: true, readsVersionedData: true }),
        view('area'),
      ]),
    ).toEqual({ generated: ['observation'], handWritten: HAND_WRITTEN });
  });

  it('refuses a view that reads versioned data without current_published_version', () => {
    expect(() =>
      planPreviewViews([...handWritten, view('rogue', { readsVersionedData: true })]),
    ).toThrow(/published\.rogue/);
  });

  it('refuses a view that chooses versions beside current_published_version', () => {
    expect(() =>
      planPreviewViews([
        ...handWritten,
        view('rogue', {
          readsCurrentPublishedVersion: true,
          choosesVersions: true,
          readsVersionedData: true,
        }),
      ]),
    ).toThrow(/published\.rogue/);
  });

  it('refuses a hand-written preview view with no published view', () => {
    expect(() => planPreviewViews(handWritten.slice(1))).toThrow(/available_data/);
  });
});
