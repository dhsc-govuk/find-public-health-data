import { describe, expect, it } from 'vitest';

import { type PublishedViewReads, planPreviewViews } from './preview-views.ts';

const HAND_WRITTEN = [
  'available_data',
  'indicator',
  'indicator_slug',
  'indicator_update_summary',
  'observation_dimension',
  'observation_note',
  'observation_range',
];

function view(name: string, reads: Partial<Omit<PublishedViewReads, 'name'>> = {}) {
  return {
    name,
    readsCurrentPublishedVersion: false,
    choosesVersions: false,
    readsVersionedData: false,
    readsPublishedViews: [],
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

  it('refuses a view that reads a versioned published view keyed by indicator id alone', () => {
    expect(() =>
      planPreviewViews([
        ...handWritten,
        view('indicator_names', { readsPublishedViews: ['indicator'] }),
      ]),
    ).toThrow(/published\.indicator_names/);
  });

  it('refuses a view that reads a versioned published view beside current_published_version', () => {
    expect(() =>
      planPreviewViews([
        ...handWritten,
        view('topic_indicator_name', {
          readsCurrentPublishedVersion: true,
          readsVersionedData: true,
          readsPublishedViews: ['indicator'],
        }),
      ]),
    ).toThrow(/published\.topic_indicator_name/);
  });

  it('refuses a view that reads versioned data through a chain of published views', () => {
    expect(() =>
      planPreviewViews([
        ...handWritten,
        view('indicator_names', { readsPublishedViews: ['indicator'] }),
        view('indicator_name_lengths', { readsPublishedViews: ['indicator_names'] }),
      ]),
    ).toThrow(/published\.indicator_name_lengths/);
  });

  it('copies no view that reads only reference views', () => {
    expect(
      planPreviewViews([
        ...handWritten,
        view('area'),
        view('area_names', { readsPublishedViews: ['area'] }),
      ]),
    ).toEqual({ generated: [], handWritten: HAND_WRITTEN });
  });

  it('refuses a hand-written preview view with no published view', () => {
    expect(() => planPreviewViews(handWritten.slice(1))).toThrow(/available_data/);
  });
});
