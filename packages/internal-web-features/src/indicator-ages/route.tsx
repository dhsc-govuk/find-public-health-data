import type { AgesFormValues, AgesPageField } from '@fphd/internal-api-features/contract';
import { titleFromPage } from '@fphd/ui';

import { sectionBackLinkHandle, useSectionForm } from '../indicator-section-route.ts';
import { loadAges, submitAges } from './loader.ts';
import { AgesPage } from './page.tsx';

export const loader = loadAges;

export const action = submitAges;

export const meta = titleFromPage;

export const handle = sectionBackLinkHandle;

// After Add or a remove, the action's answer is the page with its ranges changed.
export function AgesRoute() {
  return <AgesPage {...useSectionForm<AgesPageField, AgesFormValues>()} />;
}

export default AgesRoute;
