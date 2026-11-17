import type { SetPreviewPage } from '@fphd/internal-web-features';
import { indicatorPageContext, indicatorPageDetailSchema } from '@fphd/public-web-features';

// The preview API always gives both, so a detail without them is an error, not a public one.
const previewDetailSchema = indicatorPageDetailSchema.required({
  unanswered: true,
  dataState: true,
});

/**
 * The public indicator page's settings for its preview: the preview's links, and the detail
 * schema that keeps what a draft leaves unanswered and its data state.
 */
export const setPreviewPage: SetPreviewPage = (context, links) =>
  context.set(indicatorPageContext, { detailSchema: previewDetailSchema, links });
