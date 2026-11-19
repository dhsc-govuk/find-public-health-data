// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { SearchField } from './search-field.tsx';

afterEach(cleanup);

describe('SearchField', () => {
  it('shows the hint between the label and the search box', () => {
    const { container } = render(
      <SearchField hint="For example, diabetes" id="search" label="Search for data" name="q" />,
    );

    const hint = screen.getByText('For example, diabetes');
    expect(hint.className).toContain('govuk-hint');
    const label = screen.getByText('Search for data');
    const input = screen.getByLabelText('Search for data');
    expect(label.compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(hint.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelectorAll('.govuk-hint')).toHaveLength(1);
  });

  it('leaves the hint out when there is none', () => {
    const { container } = render(<SearchField id="search" label="Search for data" name="q" />);

    expect(container.querySelector('.govuk-hint')).toBeNull();
  });
});
