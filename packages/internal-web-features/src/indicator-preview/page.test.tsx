// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';

import { IndicatorPreviewPage } from './page.tsx';

afterEach(cleanup);

it('says it is a preview in body text under the "Important" banner, as the prototype does', () => {
  render(
    <IndicatorPreviewPage>
      <h1>An indicator</h1>
    </IndicatorPreviewPage>,
  );

  const banner = screen.getByRole('region', { name: 'Important' });
  const text = banner.querySelector('p');

  expect(text?.textContent).toBe('This is a preview of the indicator');
  expect(text?.className).toBe('govuk-body');
  expect(screen.getByRole('heading', { level: 1, name: 'An indicator' })).toBeTruthy();
});

it('says a metadata-only preview shows only the metadata, as the indicator is in another team', () => {
  render(
    <IndicatorPreviewPage metadataOnly>
      <h1>An indicator</h1>
    </IndicatorPreviewPage>,
  );

  const banner = screen.getByRole('region', { name: 'Important' });

  expect(banner.querySelector('p')?.textContent).toBe(
    'This is a preview of the indicator. Only metadata is visible as this indicator belongs to a team you are not in.',
  );
});
