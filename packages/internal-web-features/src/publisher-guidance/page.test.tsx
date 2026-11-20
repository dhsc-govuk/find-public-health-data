// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PublisherGuidancePage } from './page.tsx';
import { GUIDANCE_ANCHORS } from './paths.ts';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/publish/guidance']}>
      <PublisherGuidancePage />
    </MemoryRouter>,
  );
}

function contents() {
  return within(screen.getByRole('navigation', { name: 'Contents' }));
}

function tableUnder(heading: string) {
  return within(screen.getByRole('table', { name: heading }));
}

describe('PublisherGuidancePage', () => {
  it('heads the page "Publisher guidance"', () => {
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Publisher guidance' })).toBeTruthy();
  });

  it('holds every anchor a guidance link can point at, once each', () => {
    const { container } = renderPage();

    for (const anchor of GUIDANCE_ANCHORS) {
      expect(container.querySelectorAll(`[id="${anchor}"]`), anchor).toHaveLength(1);
    }
  });

  it('lists each section and its parts in the contents, each linking to its heading', () => {
    const { container } = renderPage();
    const links = contents().getAllByRole('link');

    expect(links.map((link) => link.textContent)).toEqual([
      'Writing accessible content',
      'Sentence and paragraph length',
      'Technical terms and acronyms',
      'Plain language alternatives',
      'Vocabulary and punctuation',
      'Formatting text with markdown',
      'Metadata',
      'Mandatory',
      'Standardised fields',
      'Dependent on indicator',
      'Publishing',
      'Update frequency',
      'Publishing date',
      'Notes for reviewers (only for internal use and for new indicators)',
      'Review process',
      'New indicators',
      'Updates to indicators',
    ]);
    for (const link of links) {
      const { hash, pathname } = new URL(link.getAttribute('href') ?? '', 'http://localhost');
      const target = container.querySelector(`[id="${hash.slice(1)}"]`);
      expect(pathname).toBe('/publish/guidance');
      expect(target?.matches('h2, h3'), link.textContent ?? '').toBe(true);
      expect(target?.textContent).toBe(link.textContent);
    }
  });

  it('leaves out the data table format section, which has no guidance yet', () => {
    renderPage();

    expect(screen.queryByText('Indicator data table format')).toBeNull();
    expect(screen.queryByText('TBD')).toBeNull();
  });

  it('gives each question its guidance and examples, headed by the question', () => {
    renderPage();
    const name = screen.getByRole('rowheader', { name: 'Name' });
    const row = within(name.closest('tr') as HTMLElement);

    expect(name.id).toBe('name');
    expect(row.getByText('A good indicator name is:')).toBeTruthy();
    expect(row.getByText('Percentage of GP patients aged 17 and over with diabetes')).toBeTruthy();
  });

  it('gives the standard calculation method of each value type, or says there is none', () => {
    renderPage();
    const table = tableUnder('Indicator calculation methods');

    expect(table.getByRole('rowheader', { name: 'Count' }).closest('tr')?.textContent).toBe(
      'CountValue and count are the same.',
    );
    expect(table.getByRole('rowheader', { name: 'Score' }).closest('tr')?.textContent).toBe(
      'ScoreNo standard method available',
    );
  });

  it('opens the confidence interval methods with what a confidence interval is', () => {
    renderPage();
    const [, general] = tableUnder('Confidence interval methods').getAllByRole('row');

    expect(general?.textContent).toMatch(/^\[General\]A confidence interval is a range of values/);
  });

  it('links to no technical guidance, which the public site does not have yet', () => {
    renderPage();

    expect(screen.queryByText(/Read our technical guidance/)).toBeNull();
  });
});

describe('PublisherGuidancePage contents list height', () => {
  function stubWindow({ matches, top }: { matches: boolean; top: number }) {
    vi.stubGlobal('matchMedia', () => ({ matches }));
    vi.stubGlobal('innerHeight', 800);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top,
    } as DOMRect);
  }

  it('is capped to the space left below it in the window', () => {
    stubWindow({ matches: true, top: 400 });
    renderPage();

    expect(screen.getByRole('navigation', { name: 'Contents' }).style.maxHeight).toBe('380px');
  });

  it('leaves a gap at the bottom of the window once it has stuck to the top', () => {
    stubWindow({ matches: true, top: 20 });
    renderPage();

    expect(screen.getByRole('navigation', { name: 'Contents' }).style.maxHeight).toBe('760px');
  });

  it('is never taller than the stuck list, which the window can scroll past', () => {
    stubWindow({ matches: true, top: -300 });
    renderPage();

    expect(screen.getByRole('navigation', { name: 'Contents' }).style.maxHeight).toBe('780px');
  });

  it('keeps a usable height when almost none of the window is left below it', () => {
    stubWindow({ matches: true, top: 790 });
    renderPage();

    expect(screen.getByRole('navigation', { name: 'Contents' }).style.maxHeight).toBe('200px');
  });

  it('is left to the stylesheet below tablet width, where it shows in full', () => {
    stubWindow({ matches: false, top: 400 });
    renderPage();

    expect(screen.getByRole('navigation', { name: 'Contents' }).style.maxHeight).toBe('');
  });
});
