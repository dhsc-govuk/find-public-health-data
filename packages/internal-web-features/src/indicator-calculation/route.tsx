import type { CalculationField } from '@fphd/internal-api-features/contract';
import { titleFromPage } from '@fphd/ui';
import { useLoaderData } from 'react-router';

import { sectionBackLinkHandle, useSectionForm } from '../indicator-section-route.ts';
import { loadCalculation, saveCalculation } from './loader.ts';
import { CalculationPage } from './page.tsx';

export const loader = loadCalculation;

export const action = saveCalculation;

export const meta = titleFromPage;

export const handle = sectionBackLinkHandle;

export function CalculationRoute() {
  const { valueType } = useLoaderData<typeof loader>();
  const form = useSectionForm<CalculationField>();

  return <CalculationPage {...form} valueType={valueType} />;
}

export default CalculationRoute;
