import { indicatorPath } from '@fphd/utils/indicator-path';
import { createContext, useContext } from 'react';
import { indicatorCsvPath, indicatorMetadataPath } from './paths.ts';

/**
 * The addresses the indicator page links to and redirects to. The public page's are its own; a
 * route that shows the page somewhere else gives its own, so the page's links stay there.
 */
export interface IndicatorLinks {
  /** The page of the indicator with this slug. */
  page(slug: string): string;
  /** One of the page's CSV downloads. */
  csv(slug: string, kind: 'table' | 'all-data'): string;
  /** The page's metadata download. */
  metadata(slug: string): string;
  /** The geography lookup the page's area pickers ask, with the indicator's slug. */
  geographies: string;
  /** The indicator search the compare picker asks. */
  indicatorSearch: string;
}

export const publicIndicatorLinks: IndicatorLinks = {
  page: indicatorPath,
  csv: indicatorCsvPath,
  metadata: indicatorMetadataPath,
  geographies: '/geographies',
  indicatorSearch: '/indicators/search',
};

/** The page's links for its components: the public page's unless a route provides others. */
export const IndicatorLinksContext = createContext<IndicatorLinks>(publicIndicatorLinks);

export function useIndicatorLinks(): IndicatorLinks {
  return useContext(IndicatorLinksContext);
}
