import { startIndicatorPreview } from '@fphd/internal-web-features';
import { loadGeography } from '@fphd/public-web-features/indicator-resources';
import type { LoaderFunctionArgs } from 'react-router';

import { setPreviewPage } from './indicator-preview-page.ts';

export async function loader(args: LoaderFunctionArgs) {
  const { args: previewArgs } = await startIndicatorPreview(args, setPreviewPage);
  return loadGeography(previewArgs);
}
