import type { ShouldRevalidateFunctionArgs } from 'react-router';
import { expect, it } from 'vitest';
import { shouldRevalidate } from './route.tsx';

it.each([
  ['?age-90799=65%2B+yrs', false],
  ['?age-90799=65%2B+yrs&sex-90799=Female', false],
  ['?age-90799=65%2B+yrs&as=E06000052', true],
])('reuses loaded histories when just the age changes: %s', (search, expected) => {
  expect(
    shouldRevalidate({
      currentUrl: new URL('http://localhost/indicator/example'),
      nextUrl: new URL(`http://localhost/indicator/example${search}`),
    } as ShouldRevalidateFunctionArgs),
  ).toBe(expected);
});
