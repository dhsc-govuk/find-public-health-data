import { useEffect, useRef, useState } from 'react';

import {
  AREA_COMPARISON_PARENT_TYPES,
  AREA_NEIGHBOUR_GROUPS,
  type CompareAreaOption,
  highlightedAreaCodes,
  withNeighbours,
} from './area-comparison.ts';

type Parent = CompareAreaOption['parent'];

/**
 * The compare areas tab's options with their regions and the highlighted areas' statistical
 * neighbours. A page that didn't render the tab carries neither, so once the returned ref's
 * element is first on screen they are fetched: regions once, neighbours as areas are highlighted.
 */
export function useCompareAreaDetail({
  slug,
  group,
  areas,
  params,
}: {
  slug: string;
  group: string;
  areas: CompareAreaOption[];
  params: URLSearchParams;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const [parents, setParents] = useState<{ group: string; byCode: Map<string, Parent> }>();
  const [neighbours, setNeighbours] = useState(new Map<string, string[]>());

  useEffect(() => {
    const element = ref.current;
    if (!element || shown) return;
    // Within a screen's height counts, so a shown tab loads before the picker is scrolled to,
    // while a hidden tab (display: none) never intersects at all.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some(({ isIntersecting }) => isIntersecting)) setShown(true);
      },
      { rootMargin: '100% 0px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [shown]);

  const needsParents =
    Boolean(AREA_COMPARISON_PARENT_TYPES[group]) &&
    areas.every(({ parent }) => parent === undefined);
  useEffect(() => {
    if (!shown || !needsParents || parents?.group === group) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ indicator: slug, displayGroup: group, parents: '1' });
    void fetch(`/compare-areas?${query}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : undefined))
      .then((body: { parents: { code: string; parent: Parent }[] | null } | undefined) => {
        if (body?.parents) {
          setParents({
            group,
            byCode: new Map(body.parents.map(({ code, parent }) => [code, parent])),
          });
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [shown, needsParents, parents?.group, slug, group]);

  const withParents =
    parents?.group === group
      ? areas.map((area) => ({ ...area, parent: parents.byCode.get(area.code) ?? null }))
      : areas;
  const known = new Set([
    ...withParents.flatMap(({ code, neighbours: list }) => (list ? [code] : [])),
    ...neighbours.keys(),
  ]);
  const missing = AREA_NEIGHBOUR_GROUPS.has(group)
    ? highlightedAreaCodes(params, withParents).filter((code) => !known.has(code))
    : [];
  const missingKey = missing.join(',');
  useEffect(() => {
    if (!shown || !missingKey) return;
    const codes = missingKey.split(',');
    const controller = new AbortController();
    const query = new URLSearchParams(codes.map((code) => ['areaCode', code]));
    void fetch(`/compare-areas?${query}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : undefined))
      .then((body: { neighbours: { code: string; neighbours: string[] }[] } | undefined) => {
        if (!body) return;
        const found = new Map(body.neighbours.map(({ code, neighbours: list }) => [code, list]));
        setNeighbours((previous) => {
          const next = new Map(previous);
          // Areas without neighbours are remembered as such, so they are not asked for again.
          for (const code of codes) next.set(code, found.get(code) ?? []);
          return next;
        });
      })
      .catch(() => {});
    return () => controller.abort();
  }, [shown, missingKey]);

  return {
    ref,
    areas: withNeighbours(
      withParents,
      [...neighbours].map(([code, list]) => ({ code, neighbours: list })),
    ),
  };
}
