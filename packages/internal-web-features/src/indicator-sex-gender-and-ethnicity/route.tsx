import type {
  SexGenderAndEthnicityField,
  SexGenderAndEthnicityFormValues,
} from '@fphd/internal-api-features/contract';
import { titleFromPage } from '@fphd/ui';

import { sectionBackLinkHandle, useSectionForm } from '../indicator-section-route.ts';
import { loadSexGenderAndEthnicity, submitSexGenderAndEthnicity } from './loader.ts';
import { SexGenderAndEthnicityPage } from './page.tsx';

export const loader = loadSexGenderAndEthnicity;

export const action = submitSexGenderAndEthnicity;

export const meta = titleFromPage;

export const handle = sectionBackLinkHandle;

export function SexGenderAndEthnicityRoute() {
  return (
    <SexGenderAndEthnicityPage
      {...useSectionForm<SexGenderAndEthnicityField, SexGenderAndEthnicityFormValues>()}
    />
  );
}

export default SexGenderAndEthnicityRoute;
