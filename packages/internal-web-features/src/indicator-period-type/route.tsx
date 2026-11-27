import type { PeriodTypeField, PeriodTypeFormValues } from '@fphd/internal-api-features/contract';
import { titleFromPage } from '@fphd/ui';

import { sectionBackLinkHandle, useSectionForm } from '../indicator-section-route.ts';
import { loadPeriodType, submitPeriodType } from './loader.ts';
import { PeriodTypePage } from './page.tsx';

export const loader = loadPeriodType;

export const action = submitPeriodType;

export const meta = titleFromPage;

export const handle = sectionBackLinkHandle;

export function PeriodTypeRoute() {
  return <PeriodTypePage {...useSectionForm<PeriodTypeField, PeriodTypeFormValues>()} />;
}

export default PeriodTypeRoute;
