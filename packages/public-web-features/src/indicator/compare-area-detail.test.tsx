// @vitest-environment jsdom
import { MAX_NEIGHBOUR_AREAS_PER_REQUEST } from '@fphd/public-api-features/contract';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { CompareAreaOption } from './area-comparison.ts';
import { useCompareAreaDetail } from './compare-area-detail.ts';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const options = {
  slug: 'indicator-108',
  group: 'Local authorities',
  areas: [{ code: 'E06000001', name: 'Hartlepool' }] as CompareAreaOption[],
  params: new URLSearchParams('highlight=E06000001'),
};

function mount(props: Parameters<typeof useCompareAreaDetail>[0] = options) {
  const result = {} as { current: ReturnType<typeof useCompareAreaDetail> };
  function Harness() {
    result.current = useCompareAreaDetail(props);
    return <div ref={result.current.ref} />;
  }
  render(<Harness />);
  return result;
}

it('loads details without IntersectionObserver and retries failed regions and neighbours', async () => {
  vi.stubGlobal('IntersectionObserver', undefined);
  const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
  vi.stubGlobal('fetch', fetcher);
  const result = mount();
  await waitFor(() => expect(result.current.error).toBe(true));
  expect(fetcher).toHaveBeenCalledTimes(2);
  fetcher.mockImplementation(async (url: string) =>
    Response.json(
      url.includes('parents=1')
        ? {
            parents: [{ code: 'E06000001', parent: { code: 'E12000001', name: 'North East' } }],
          }
        : { neighbours: [{ code: 'E06000001', neighbours: ['E06000006'] }] },
    ),
  );
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.areas[0]?.neighbours).toEqual(['E06000006']));
  expect(result.current.areas[0]?.parent?.name).toBe('North East');
  expect(result.current.error).toBe(false);
  expect(fetcher).toHaveBeenCalledTimes(4);
});

it('does not cache an unsuccessful neighbour response as an empty list', async () => {
  vi.stubGlobal('IntersectionObserver', undefined);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('parents=1')) throw new Error('Network unavailable');
      return Response.json({ neighbours: null });
    }),
  );
  const result = mount();
  await waitFor(() => expect(result.current.error).toBe(true));
  expect(result.current.areas[0]?.neighbours).toBeUndefined();
});

it('loads every highlighted area in capped requests without caching truncated codes as empty', async () => {
  vi.stubGlobal('IntersectionObserver', undefined);
  const areas = Array.from({ length: MAX_NEIGHBOUR_AREAS_PER_REQUEST + 1 }, (_, index) => ({
    code: `E06${String(index).padStart(6, '0')}`,
    name: `Area ${index}`,
    parent: null,
  }));
  const requested: string[][] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const codes = new URL(url, 'http://localhost').searchParams.getAll('areaCode');
      requested.push(codes);
      return Response.json({
        neighbours: codes.slice(0, MAX_NEIGHBOUR_AREAS_PER_REQUEST).map((code) => ({
          code,
          neighbours: ['E06000006'],
        })),
      });
    }),
  );
  const result = mount({
    ...options,
    areas,
    params: new URLSearchParams(areas.map(({ code }) => ['highlight', code])),
  });
  await waitFor(() =>
    expect(result.current.areas.every(({ neighbours }) => neighbours?.length === 1)).toBe(true),
  );
  expect(requested.map((codes) => codes.length)).toEqual([MAX_NEIGHBOUR_AREAS_PER_REQUEST, 1]);
  expect(requested.flat()).toEqual(areas.map(({ code }) => code));
});
