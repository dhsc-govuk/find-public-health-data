import type {
  BenchmarkingFormValues,
  BenchmarkingPageField,
} from '@fphd/internal-api-features/contract';
import { titleFromPage } from '@fphd/ui';

import { sectionBackLinkHandle, useSectionForm } from '../indicator-section-route.ts';
import { loadBenchmarking, submitBenchmarking } from './loader.ts';
import { BenchmarkingPage } from './page.tsx';

export const loader = loadBenchmarking;

export const action = submitBenchmarking;

export const meta = titleFromPage;

export const handle = sectionBackLinkHandle;

// After Add or a remove, the action's answer is the page with its goals changed.
export function BenchmarkingRoute() {
  return <BenchmarkingPage {...useSectionForm<BenchmarkingPageField, BenchmarkingFormValues>()} />;
}

export default BenchmarkingRoute;
