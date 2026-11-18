import type { UIMatch } from 'react-router';

/**
 * A route's `handle` export, read by the app shell to place a back link above the main content
 * where GOV.UK puts it. The function form takes the route's loader data.
 */
export interface BackLinkHandle<Data = unknown> {
  backHref: string | ((data: Data) => string);
  /**
   * Names the destination, as GOV.UK asks of a back link; without it the link reads "Back". The
   * function form takes the route's loader data, for a route reached from more than one page.
   */
  backText?: string | ((data: Data) => string);
}

export interface BackLink {
  href: string;
  text?: string | undefined;
}

export function backLinkHandle<Data>(
  backHref: BackLinkHandle<Data>['backHref'],
  backText?: BackLinkHandle<Data>['backText'],
): BackLinkHandle<Data> {
  return backText === undefined ? { backHref } : { backHref, backText };
}

function isBackLinkHandle(handle: unknown): handle is BackLinkHandle {
  return typeof handle === 'object' && handle !== null && 'backHref' in handle;
}

/** The back link of the deepest matched route that declares one; a loader-derived link needs the loader to have run. */
export function backLinkFrom(matches: readonly UIMatch[]): BackLink | undefined {
  for (const match of matches.toReversed()) {
    if (!isBackLinkHandle(match.handle)) continue;

    const { backHref, backText } = match.handle;
    const needsData = typeof backHref === 'function' || typeof backText === 'function';

    if (needsData && match.loaderData === undefined) continue;
    return {
      href: typeof backHref === 'function' ? backHref(match.loaderData) : backHref,
      text: typeof backText === 'function' ? backText(match.loaderData) : backText,
    };
  }

  return undefined;
}
