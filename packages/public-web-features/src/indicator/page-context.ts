import {
  type IndicatorPageDetail,
  indicatorDetailSchema,
} from '@fphd/public-api-features/contract';
import type { ApiResponseSchema } from '@fphd/web-server/api-client';
import { createContext } from 'react-router';
import { type IndicatorLinks, publicIndicatorLinks } from './links.ts';

/** What the indicator page's loaders need to know about the page they load. */
export interface IndicatorPageSettings {
  /**
   * The schema the loaders parse an indicator's detail with. The public page's is the strict
   * public schema, which drops any unanswered list or data state, so it never shows a placeholder.
   */
  detailSchema: ApiResponseSchema<IndicatorPageDetail>;
  /** Where the loaders redirect to, such as an indicator's canonical address. */
  links: IndicatorLinks;
}

/** The public indicator page's settings unless a route that reuses its loaders sets others. */
export const indicatorPageContext = createContext<IndicatorPageSettings>({
  detailSchema: indicatorDetailSchema,
  links: publicIndicatorLinks,
});
