import { indicatorPath } from '@fphd/utils/indicator-path';
import { isShortId, SHORT_ID_PATTERN } from '@fphd/utils/short-id';
import { isReservedSlug, SLUG_MAX_LENGTH, SLUG_PATTERN } from '@fphd/utils/slug';

/** One of the page's server-rendered downloads, under the same address as the page. */
export function indicatorCsvPath(slug: string, kind: 'table' | 'all-data'): string {
  return `${indicatorPath(slug)}/${kind}.csv`;
}

/**
 * A number or a case variant has one permanent home, so it 301s. A superseded slug 302s:
 * versions of one indicator share a slug, so an old address could become canonical again,
 * and a browser holding a cached 301 each way would loop between them.
 */
export function redirectStatus(segment: string, canonicalSlug: string): 301 | 302 {
  return SHORT_ID_PATTERN.test(segment) || segment.toLowerCase() === canonicalSlug ? 301 : 302;
}

/**
 * Whether a route segment can address an indicator: a short id, or a slug in any case.
 * Case and superseded slugs are the loader's redirect, not a 404. A slug is never digits only,
 * so a digit run too large for the column addresses nothing rather than falling through.
 * A reserved word names an API collection endpoint, never an indicator, so it stops here.
 */
export function isIndicatorSegment(segment: string): boolean {
  const lowered = segment.toLowerCase();

  if (SHORT_ID_PATTERN.test(lowered)) return isShortId(lowered);

  return (
    lowered.length <= SLUG_MAX_LENGTH && SLUG_PATTERN.test(lowered) && !isReservedSlug(lowered)
  );
}

export function indicatorMetadataPath(slug: string): string {
  return `${indicatorPath(slug)}/metadata.txt`;
}

export function indicatorSelectionUrl(
  location: { pathname: string; search: string },
  areaCodes: string[],
  areaLevels: string[],
  shortId?: number,
): string {
  const params = new URLSearchParams(location.search);
  const hasAreas = (codes: string[], levels: string[]) =>
    codes.some((code) => code !== '' && code !== 'E92000001') || levels.some(Boolean);
  const hadAreas = hasAreas(params.getAll('as'), params.getAll('als'));
  if (
    shortId !== undefined &&
    !hadAreas &&
    hasAreas(areaCodes, areaLevels) &&
    !params.has(`cmp-${shortId}`)
  ) {
    params.append(`cmp-${shortId}`, 'england');
  }
  params.delete('as');
  params.delete('als');
  for (const code of areaCodes) params.append('as', code);
  for (const level of areaLevels) params.append('als', level);
  return `${location.pathname}?${params}`;
}
