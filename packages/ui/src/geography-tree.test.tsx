// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GeographyTree } from './geography-tree.tsx';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('GeographyTree', () => {
  it('shows the areas immediately when only one preloaded geography level is available', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    render(
      <GeographyTree
        choicesLabel="Geography choices"
        levels={['Statistical regions']}
        name="areas"
        onChange={() => undefined}
        onLevelsChange={() => undefined}
        selected={[]}
        selectedLevels={[]}
        fallback={{
          query: '',
          level: '',
          groups: [],
          error: false,
          previews: [
            { name: 'Statistical regions', areas: [{ code: 'E12000007', name: 'London' }] },
          ],
        }}
      />,
    );
    expect(
      screen
        .getByRole('button', { name: 'Collapse Statistical regions' })
        .getAttribute('aria-expanded'),
    ).toBe('true');
    expect(screen.getByRole('checkbox', { name: 'London' })).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('announces a level while its areas load', () => {
    vi.stubGlobal('fetch', () => new Promise(() => undefined));
    const { container } = render(
      <GeographyTree
        choicesLabel="Geography choices"
        levels={['Local authorities']}
        name="areas"
        onChange={() => undefined}
        onLevelsChange={() => undefined}
        selected={[]}
        selectedLevels={[]}
      />,
    );

    const status = container.querySelector('p[aria-live="polite"]');
    expect(status?.textContent).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Expand Local authorities' }));

    expect(status?.textContent).toBe('Loading Local authorities…');
    expect(status?.className).toContain('govuk-visually-hidden');
  });

  it('keeps the tree visible while a search is pending', () => {
    vi.stubGlobal('fetch', () => new Promise(() => undefined));
    render(
      <GeographyTree
        choicesLabel="Geography choices"
        levels={['Local authorities']}
        name="areas"
        onChange={() => undefined}
        onLevelsChange={() => undefined}
        selected={[]}
        selectedLevels={[]}
      />,
    );

    fireEvent.change(screen.getByRole('searchbox', { name: 'Add geographies' }), {
      target: { value: 'Manchester' },
    });

    expect(screen.getByText('Local authorities')).toBeTruthy();
    expect(screen.getByText('Finding geographies…').className).toContain('govuk-visually-hidden');
  });
});

it('searches a flat catalogue supplied after the tab loader finishes', () => {
  const props = {
    flat: true,
    levels: ['Local authorities'],
    name: 'areas',
    selected: [],
    selectedLevels: [],
    onChange: () => undefined,
    onLevelsChange: () => undefined,
  };
  const fallback = { query: '', level: '', groups: [], previews: [], error: false };
  const { rerender } = render(
    <GeographyTree choicesLabel="Geography choices" {...props} fallback={fallback} />,
  );
  rerender(
    <GeographyTree
      choicesLabel="Geography choices"
      {...props}
      fallback={{
        ...fallback,
        previews: [{ name: 'Local authorities', areas: [{ code: 'E08000035', name: 'Leeds' }] }],
      }}
    />,
  );
  fireEvent.change(screen.getByRole('searchbox', { name: 'Add geographies' }), {
    target: { value: 'Leeds' },
  });
  expect(screen.getByRole('checkbox', { name: 'Leeds' })).toBeTruthy();
  expect(screen.getByRole('region', { name: 'Geography choices' }).getAttribute('tabindex')).toBe(
    '0',
  );
});

it('names each scrolling region with the label its tree is given', () => {
  const tree = (choicesLabel: string) => (
    <GeographyTree
      choicesLabel={choicesLabel}
      flat
      levels={['Local authorities']}
      name="areas"
      selected={[]}
      selectedLevels={[]}
      onChange={() => undefined}
      onLevelsChange={() => undefined}
    />
  );
  render(
    <>
      {tree('Geography choices for Data')}
      {tree('Geography choices for Area summaries')}
    </>,
  );

  expect(screen.getAllByRole('region').map((region) => region.getAttribute('aria-label'))).toEqual([
    'Geography choices for Data',
    'Geography choices for Area summaries',
  ]);
});

describe('GeographyTree single-choice search results', () => {
  const cornwallResults = [
    {
      name: 'Integrated care boards (ICBs)',
      areas: [{ code: 'E54000036', name: 'Cornwall and the Isles of Scilly' }],
    },
    { name: 'Upper-tier local authorities', areas: [{ code: 'E06000052', name: 'Cornwall' }] },
    { name: 'Lower-tier local authorities', areas: [{ code: 'E06000052', name: 'Cornwall' }] },
    { name: 'NHS regions', areas: [] },
  ];
  const renderSearch = (selected: string[], onChange = vi.fn()) => {
    vi.stubGlobal('fetch', () => new Promise(() => undefined));
    const tree = (codes: string[]) => (
      <GeographyTree
        choicesLabel="Geography choices"
        single
        levels={cornwallResults.map(({ name }) => name)}
        name="ga"
        searchLabel="Search for a geography"
        onChange={onChange}
        onLevelsChange={() => undefined}
        selected={codes}
        selectedLevels={[]}
        fallback={{ query: 'cornwa', level: '', groups: cornwallResults, error: false }}
      />
    );
    const { rerender } = render(tree(selected));
    return { rerender: (codes: string[]) => rerender(tree(codes)) };
  };
  const radioIn = (group: string) =>
    within(screen.getByRole('group', { name: `Areas in ${group}` })).getByRole('radio');

  it('lists the matches under an open heading for each type that has one', () => {
    renderSearch([]);

    const headings = screen.getAllByRole('button', { expanded: true });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      'Integrated care boards (ICBs)',
      'Upper-tier local authorities',
      'Lower-tier local authorities',
    ]);
    expect(screen.queryByRole('button', { name: 'NHS regions' })).toBeNull();
    expect(radioIn('Upper-tier local authorities').getAttribute('value')).toBe('E06000052');
  });

  it('collapses a type until the search changes', () => {
    renderSearch([]);

    fireEvent.click(screen.getByRole('button', { name: 'Upper-tier local authorities' }));
    expect(
      screen
        .getByRole('button', { name: 'Upper-tier local authorities' })
        .getAttribute('aria-expanded'),
    ).toBe('false');
    expect(
      screen.queryByRole('group', { name: 'Areas in Upper-tier local authorities' }),
    ).toBeNull();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search for a geography' }), {
      target: { value: 'cornwal' },
    });
    expect(
      screen
        .getByRole('button', { name: 'Upper-tier local authorities' })
        .getAttribute('aria-expanded'),
    ).toBe('true');
  });

  it('checks the chosen area under the first type that lists it', () => {
    renderSearch(['E06000052']);

    expect((radioIn('Upper-tier local authorities') as HTMLInputElement).checked).toBe(true);
    expect((radioIn('Lower-tier local authorities') as HTMLInputElement).checked).toBe(false);
  });

  it('keeps the radio the user clicked checked when another type lists the same area', () => {
    const onChange = vi.fn();
    const { rerender } = renderSearch([], onChange);

    fireEvent.click(radioIn('Lower-tier local authorities'));
    expect(onChange).toHaveBeenCalledWith(['E06000052']);
    rerender(['E06000052']);

    expect((radioIn('Upper-tier local authorities') as HTMLInputElement).checked).toBe(false);
    expect((radioIn('Lower-tier local authorities') as HTMLInputElement).checked).toBe(true);
  });
});

describe('GeographyTree regions', () => {
  const areas = [
    { code: 'E06000001', name: 'Hartlepool' },
    { code: 'E06000047', name: 'County Durham' },
    { code: 'E08000025', name: 'Birmingham' },
    { code: 'E09000001', name: 'City of London' },
  ];
  const regions = [
    { code: 'E12000001', name: 'North East', areas: ['E06000047', 'E06000001'] },
    { code: 'E12000005', name: 'West Midlands', areas: ['E08000025'] },
  ];
  const tree = (selected: string[], onChange = vi.fn(), maxAreaTicks?: number) => (
    <GeographyTree
      choicesLabel="Geography choices"
      flat
      levels={['Local authorities']}
      name="highlight"
      regions={regions}
      regionName="highlightRegion"
      regionAreasNoun="upper tier local authorities"
      selected={selected}
      {...(maxAreaTicks === undefined ? {} : { maxAreaTicks })}
      selectedLevels={[]}
      fallback={{
        query: '',
        level: '',
        groups: [],
        previews: [{ name: 'Local authorities', areas }],
        error: false,
      }}
      onChange={onChange}
      onLevelsChange={() => undefined}
    />
  );

  it('ticks and unticks every area in a region from its checkbox', () => {
    const onChange = vi.fn();
    const { rerender } = render(tree(['E08000025'], onChange));
    const northEast = screen.getByRole('checkbox', {
      name: 'North East: all 2 upper tier local authorities',
    }) as HTMLInputElement;
    expect(northEast.name).toBe('highlightRegion');
    expect(northEast.value).toBe('E12000001');
    fireEvent.click(northEast);
    expect(onChange).toHaveBeenLastCalledWith(['E08000025', 'E06000047', 'E06000001']);
    rerender(tree(['E08000025', 'E06000047', 'E06000001'], onChange));
    expect(northEast.checked).toBe(true);
    fireEvent.click(northEast);
    expect(onChange).toHaveBeenLastCalledWith(['E08000025']);
    expect(
      screen.getByText('All 2 upper tier local authorities in North East removed'),
    ).toBeTruthy();
  });

  it('shows a part-ticked region as indeterminate and lists areas outside every region', () => {
    render(tree(['E06000001']));
    const northEast = screen.getByRole('checkbox', {
      name: 'North East: all 2 upper tier local authorities',
    }) as HTMLInputElement;
    expect(northEast.checked).toBe(false);
    expect(northEast.indeterminate).toBe(true);
    expect(screen.getByRole('checkbox', { name: 'City of London' })).toBeTruthy();
  });

  it('announces only the areas added when a region reaches the selection cap', () => {
    const onChange = vi.fn();
    const { rerender } = render(tree(['E08000025'], onChange, 2));
    const northEast = screen.getByRole('checkbox', {
      name: 'North East: all 2 upper tier local authorities',
    }) as HTMLInputElement;
    fireEvent.click(northEast);
    expect(onChange).toHaveBeenLastCalledWith(['E08000025', 'E06000047']);
    expect(
      screen.getByText(
        'Added 1 of 2 upper tier local authorities in North East. You have selected the maximum number of areas.',
      ),
    ).toBeTruthy();
    rerender(tree(['E08000025', 'E06000047'], onChange, 2));
    expect(northEast.disabled).toBe(true);
    expect(
      (screen.getByRole('checkbox', { name: 'Hartlepool' }) as HTMLInputElement).disabled,
    ).toBe(true);
    const westMidlands = screen.getByRole('checkbox', {
      name: 'West Midlands: all 1 upper tier local authorities',
    }) as HTMLInputElement;
    expect(westMidlands.disabled).toBe(false);
    fireEvent.click(westMidlands);
    expect(onChange).toHaveBeenLastCalledWith(['E06000047']);
  });

  it('disables an unselected region at the selection cap', () => {
    render(tree(['E09000001'], vi.fn(), 1));
    expect(
      (screen.getByRole('checkbox', { name: /North East: all/ }) as HTMLInputElement).disabled,
    ).toBe(true);
  });

  it('selects only matching areas when a region is narrowed by search', () => {
    const onChange = vi.fn();
    const { container } = render(tree(['E06000047'], onChange));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Hartlepool' } });
    const region = screen.getByRole('checkbox', {
      name: 'North East: all 1 upper tier local authorities',
    });
    expect((region as HTMLInputElement).checked).toBe(false);
    fireEvent.click(region);
    expect(onChange).toHaveBeenLastCalledWith(['E06000047', 'E06000001']);
    expect(container.querySelector('input[type="hidden"][value="E06000047"]')).toBeTruthy();
  });

  it('submits a region narrowed by search and fully ticked as still ticked', () => {
    const { container } = render(tree(['E06000001']));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Hartlepool' } });
    const region = screen.getByRole('checkbox', {
      name: 'North East: all 1 upper tier local authorities',
    }) as HTMLInputElement;
    expect(region.checked).toBe(true);
    expect(region.name).toBe('highlightRegion');
    expect(
      container.querySelector(
        'input[type="hidden"][name="highlightRegionBefore"][value="E12000001"]',
      ),
    ).toBeTruthy();
  });

  it('keeps ticks in a collapsed region submitting and narrows regions to search matches', () => {
    const { container } = render(tree(['E06000001']));
    fireEvent.click(screen.getByRole('button', { name: 'Collapse North East' }));
    expect(screen.queryByRole('checkbox', { name: 'Hartlepool' })).toBeNull();
    expect(container.querySelector('input[type="hidden"][value="E06000001"]')).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'birm' } });
    expect(screen.getByRole('checkbox', { name: 'Birmingham' })).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: /North East/ })).toBeNull();
  });
});
