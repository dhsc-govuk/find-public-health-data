import { createDocumentMeta } from '@fphd/ui';
import {
  type LoaderFunctionArgs,
  type ShouldRevalidateFunctionArgs,
  useLoaderData,
} from 'react-router';

import { loadSearchPage } from './loader.ts';
import { SearchPage } from './page.tsx';

export function shouldRevalidate({
  currentUrl,
  nextUrl,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  const searchKey = (url: URL) => {
    const params = new URLSearchParams(url.search);
    params.delete('tab-search');
    return params.toString();
  };
  const onlyTabChanged =
    currentUrl.search !== nextUrl.search && searchKey(currentUrl) === searchKey(nextUrl);
  return onlyTabChanged ? false : defaultShouldRevalidate;
}

export function createSearchRoute(publicGeographies: boolean) {
  return {
    loader: (args: LoaderFunctionArgs) => loadSearchPage(args, publicGeographies),
    meta: createDocumentMeta('Search for data'),
    shouldRevalidate,
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
