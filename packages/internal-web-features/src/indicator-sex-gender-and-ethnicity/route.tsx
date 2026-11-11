import type { SexAndAgesField, SexAndAgesFormValues } from '@fphd/internal-api-features/contract';
import { titleFromPage } from '@fphd/ui';

import { sectionBackLinkHandle, useSectionForm } from '../indicator-section-route.ts';
import { loadSexAndAges, submitSexAndAges } from './loader.ts';
import { SexAndAgesPage } from './page.tsx';

export const loader = loadSexAndAges;

export const action = submitSexAndAges;

export const meta = titleFromPage;

export const handle = sectionBackLinkHandle;

export function SexAndAgesRoute() {
  return <SexAndAgesPage {...useSectionForm<SexAndAgesField, SexAndAgesFormValues>()} />;
}

export default SexAndAgesRoute;
