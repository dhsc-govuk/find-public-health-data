export const SEARCH_PAGE_SIZE = 50;

/** The page a search URL asks for. Anything but a whole number from 1 up is the first page. */
export function searchPageNumber(value: string | null): number {
  if (value === null || !/^[1-9]\d*$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) ? page : 1;
}

/** How many pages a search's results fill. A search with no results still has one page. */
export function searchPageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
