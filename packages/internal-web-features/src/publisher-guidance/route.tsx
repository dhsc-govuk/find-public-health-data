import { backLinkHandle, createDocumentMeta } from '@fphd/ui';

import { DASHBOARD_PATH } from '../dashboard/paths.ts';
import { PUBLISHER_GUIDANCE_TITLE, PublisherGuidancePage } from './page.tsx';

export const meta = createDocumentMeta(PUBLISHER_GUIDANCE_TITLE);

export const handle = backLinkHandle(DASHBOARD_PATH, 'Back to indicators');

export function PublisherGuidanceRoute() {
  return <PublisherGuidancePage />;
}

export default PublisherGuidanceRoute;
