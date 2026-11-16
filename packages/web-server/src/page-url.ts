/** A request's query string as its page sees it: without `_routes`, which only a data request carries. */
export function pageSearch(url: URL): string {
  const searchParams = new URLSearchParams(url.search);
  searchParams.delete('_routes');
  const search = searchParams.toString();

  return search === '' ? '' : `?${search}`;
}

/**
 * The page a request is for, as a return address. A client-side navigation arrives as a data
 * request, `/manage.data?_routes=…` or `/_.data` for the root, so its data endpoint is mapped back
 * to the page.
 */
export function pagePath(requestUrl: URL): string {
  const pathname = requestUrl.pathname.endsWith('/_.data')
    ? requestUrl.pathname.replace(/_\.data$/, '')
    : requestUrl.pathname.replace(/\.data$/, '');
  return `${pathname}${pageSearch(requestUrl)}`;
}
