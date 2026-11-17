// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { createRoutesStub } from 'react-router';
import { afterEach, expect, it } from 'vitest';
import { IndicatorGeographies } from './geographies.tsx';

afterEach(cleanup);

it.each([
  ['', [], ['england']],
  ['?cmp-108=', [], ['']],
  ['?cmp-108=none', [], ['none']],
  ['?cmp-108=region&cmp-108=england', [], ['region', 'england']],
  ['?as=E08000003', ['E08000003'], []],
] as const)('preserves the no-JavaScript benchmark choice for %s', (search, codes, expected) => {
  const Routes = createRoutesStub([
    {
      path: '/',
      Component: () => (
        <IndicatorGeographies
          shortId={108}
          slug="example"
          displayGroups={[]}
          selection={{ areaCodes: [...codes], areaLevels: [], shortIds: [108] }}
        />
      ),
    },
  ]);
  const { container } = render(<Routes initialEntries={[`/${search}`]} />);
  const form = container.querySelector('form');
  if (!form) throw new Error('Geography form missing');
  expect(new FormData(form).getAll('cmp-108')).toEqual(expected);
});
