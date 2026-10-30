// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { createRoutesStub } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { sectionBackLinkHandle, useSectionForm } from './indicator-section-route.ts';

afterEach(cleanup);

describe('sectionBackLinkHandle', () => {
  it("links back to the draft's task list from above the page", () => {
    if (typeof sectionBackLinkHandle.backHref !== 'function') {
      throw new Error('back link needs the loader');
    }

    const id = '019a1b2c-3d4e-7f60-8a9b-0c1d2e3f4a5b';

    expect(sectionBackLinkHandle.backHref({ id })).toBe(`/publish/indicators/${id}/task-list`);
  });
});

describe('useSectionForm', () => {
  function SectionForm() {
    const { values, version } = useSectionForm<'answer'>();

    return <p>{`${values.answer} at ${version}`}</p>;
  }

  function renderSection(actionData?: unknown) {
    const Stub = createRoutesStub([
      { id: 'section', path: '/section', Component: SectionForm, loader: () => null },
    ]);

    render(
      <Stub
        hydrationData={{
          loaderData: { section: { values: { answer: 'Stored' }, version: 'loaded' } },
          ...(actionData === undefined ? {} : { actionData: { section: actionData } }),
        }}
        initialEntries={['/section']}
      />,
    );
  }

  it('fills the form with the answers the loader read, at their version', async () => {
    renderSection();

    expect(await screen.findByText('Stored at loaded')).toBeTruthy();
  });

  it("keeps the action's version after it re-renders the page, not the loader's newer one", async () => {
    renderSection({ values: { answer: 'Typed' }, fieldErrors: {}, version: 'shown' });

    expect(await screen.findByText('Typed at shown')).toBeTruthy();
  });
});
