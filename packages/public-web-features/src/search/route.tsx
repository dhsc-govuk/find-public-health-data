import { createDocumentMeta } from '@fphd/ui';
import { type LoaderFunctionArgs, useLoaderData } from 'react-router';

import { loadSearchPage } from './loader.ts';
import { SearchPage } from './page.tsx';

export function createSearchRoute(publicGeographies: boolean) {
  return {
    loader: (args: LoaderFunctionArgs) => loadSearchPage(args, publicGeographies),
    meta: createDocumentMeta('Search for data'),
    Component: SearchRoute,
  };
}

const publicSearch = createSearchRoute(true);
export const loader = publicSearch.loader;
export const meta = publicSearch.meta;

export function SearchRoute() {
  const data = useLoaderData<typeof loader>();
  return <SearchPage {...data} />;
}

export default SearchRoute;
