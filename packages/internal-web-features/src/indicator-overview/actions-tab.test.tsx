// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it } from 'vitest';

import { ActionsTab } from './actions-tab.tsx';

afterEach(cleanup);

const NO_ACTIONS = 'There are no actions available for this indicator yet.';

function renderTab(props: Parameters<typeof ActionsTab>[0]) {
  render(
    <MemoryRouter>
      <ActionsTab {...props} />
    </MemoryRouter>,
  );
}

it('says there are no actions when no section has a button or a link, and there are no notes', () => {
  renderTab({
    sections: [
      { heading: 'Review', button: null, links: [] },
      { heading: 'Actions', button: null, links: [] },
    ],
  });

  expect(screen.getByText(NO_ACTIONS)).toBeTruthy();
  expect(screen.getAllByText(NO_ACTIONS)).toHaveLength(1);
});

it('says nothing of the kind once a section offers a link', () => {
  renderTab({
    sections: [
      {
        heading: 'Actions',
        button: null,
        links: [{ href: '/dashboard/indicators/an-id/preview', label: 'View indicator preview' }],
      },
    ],
  });

  expect(screen.queryByText(NO_ACTIONS)).toBeNull();
});
