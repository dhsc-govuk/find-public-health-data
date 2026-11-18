import { indicatorPreviewPath } from './paths.ts';

/**
 * The addresses the indicator page links to, inside the preview of indicator `id`. The preview
 * has one address whatever the draft's slug, so the page never redirects to its slug, and its
 * downloads, lookups and search ask the preview's own routes. The app gives these to the page as
 * its `IndicatorLinks`, so a link the page gains and this lacks fails the app's typecheck.
 */
export function previewLinks(id: string) {
  const base = indicatorPreviewPath(id);
  return {
    page: () => base,
    csv: (_slug: string, kind: 'table' | 'all-data') => `${base}/${kind}.csv`,
    metadata: () => `${base}/metadata.txt`,
    geographies: `${base}/geographies`,
    indicatorSearch: `${base}/indicators/search`,
    compareAreas: `${base}/compare-areas`,
  };
}

export type PreviewLinks = ReturnType<typeof previewLinks>;
