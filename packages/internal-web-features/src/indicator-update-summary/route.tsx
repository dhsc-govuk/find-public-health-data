import {
  type UpdateSummaryField,
  updateSummarySection,
} from '@fphd/internal-api-features/contract';
import { titleFromPage } from '@fphd/ui';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';

import { loadIndicatorSection, saveIndicatorSection } from '../indicator-section.ts';
import { sectionBackLinkHandle, useSectionForm } from '../indicator-section-route.ts';
import { UpdateSummaryPage } from './page.tsx';

export const loader = (args: LoaderFunctionArgs) =>
  loadIndicatorSection(args, updateSummarySection);

export const action = (args: ActionFunctionArgs) =>
  saveIndicatorSection(args, updateSummarySection);

export const meta = titleFromPage;

export const handle = sectionBackLinkHandle;

export function UpdateSummaryRoute() {
  return <UpdateSummaryPage {...useSectionForm<UpdateSummaryField>()} />;
}

export default UpdateSummaryRoute;
