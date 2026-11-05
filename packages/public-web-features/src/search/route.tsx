import { createDocumentMeta } from '@fphd/ui';
import { useLoaderData } from 'react-router';

import { loadSearchPage } from './loader.ts';
import { SearchPage } from './page.tsx';

export const loader = loadSearchPage;

export const meta = createDocumentMeta('Search for data');

export function SearchRoute() {
  const data = useLoaderData<typeof loader>();
  return <SearchPage {...data} />;
}

export default SearchRoute;
