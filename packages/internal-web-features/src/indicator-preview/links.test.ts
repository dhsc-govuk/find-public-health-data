import { expect, it } from 'vitest';

import { previewLinks } from './links.ts';

const id = '00000000-0000-7000-8000-000000000001';
const preview = `/dashboard/indicators/${id}/preview`;

it("keeps every one of the page's links inside the preview, whatever the slug", () => {
  const links = previewLinks(id);

  expect(links).toEqual({
    page: expect.any(Function),
    csv: expect.any(Function),
    metadata: expect.any(Function),
    geographies: `${preview}/geographies`,
    indicatorSearch: `${preview}/indicators/search`,
    compareAreas: `${preview}/compare-areas`,
  });
  expect(links.page()).toBe(preview);
  expect(links.csv('another-slug', 'table')).toBe(`${preview}/table.csv`);
  expect(links.csv('another-slug', 'all-data')).toBe(`${preview}/all-data.csv`);
  expect(links.metadata()).toBe(`${preview}/metadata.txt`);
});
