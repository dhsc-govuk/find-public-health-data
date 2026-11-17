import type { SetPreviewPage } from '@fphd/internal-web-features';
import { indicatorPageContext, indicatorPageDetailSchema } from '@fphd/public-web-features';

/**
 * The public indicator page's settings for its preview: the preview's links, and the detail
 * schema that keeps what a draft leaves unanswered and its data state.
 */
export const setPreviewPage: SetPreviewPage = (context, links) =>
  context.set(indicatorPageContext, { detailSchema: indicatorPageDetailSchema, links });
