// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRoutesStub, useLocation } from 'react-router';
import { afterEach, expect, it } from 'vitest';
import { selectedBenchmarks } from './benchmarks.ts';
import { BenchmarksPanel, PanelOptionsPanel, usePanelOptions } from './options.tsx';
import { selectedTrendColumns } from './trend.ts';

afterEach(cleanup);

function benchmarkRoutes(region = true) {
  return createRoutesStub([
    {
      path: '/',
      Component: () => {
        const [options, update] = usePanelOptions(108);
        const location = useLocation();
        return (
          <>
            <BenchmarksPanel
              choices={options.benchmarks}
              onChange={(benchmarks) => update({ ...options, benchmarks })}
              region={region}
              scope={108}
              target={{
                tabParam: 'tab-indicator',
                tabValue: 'indicator',
                anchor: 'indicator-data',
              }}
            />
            <output>{location.search}</output>
          </>
        );
      },
    },
  ]);
}

it('toggles both benchmarks independently and retains an explicit empty choice', async () => {
  const Routes = benchmarkRoutes();
  render(<Routes initialEntries={['/?as=E08000003&sex-108=Male']} />);
  const england = screen.getByRole('checkbox', { name: 'England' });
  const region = screen.getByRole('checkbox', { name: 'Statistical regions' });
  const params = () => new URLSearchParams(screen.getByRole('status').textContent ?? '');
  fireEvent.click(region);
  await waitFor(() => expect(params().getAll('cmp-108')).toEqual(['region']));
  fireEvent.click(england);
  await waitFor(() => expect(params().getAll('cmp-108')).toEqual(['england', 'region']));
  fireEvent.click(england);
  await waitFor(() => expect(params().getAll('cmp-108')).toEqual(['region']));
  fireEvent.click(region);
  await waitFor(() => expect(params().getAll('cmp-108')).toEqual(['']));
  expect(params().get('sex-108')).toBe('Male');
  expect(params().get('as')).toBe('E08000003');
});

it('submits checked benchmarks with one sentinel and preserves none when all are unticked', () => {
  const Routes = benchmarkRoutes();
  render(
    <Routes initialEntries={['/?as=E08000003&cmp-108=region&cmp-108=england&columns-108=value']} />,
  );
  const checkbox = screen.getByRole('checkbox', { name: 'England' });
  const form = checkbox.closest('form');
  if (!form) throw new Error('Benchmark form missing');
  const submitted = () => {
    const params = new URLSearchParams();
    for (const [name, value] of new FormData(form)) params.append(name, String(value));
    return params;
  };
  expect(submitted().getAll('cmp-108')).toEqual(['', 'england', 'region']);
  expect(selectedBenchmarks(submitted(), 108)).toEqual(['england', 'region']);
  for (const input of form.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))
    input.checked = false;
  expect(submitted().getAll('cmp-108')).toEqual(['']);
  expect(selectedBenchmarks(submitted(), 108)).toEqual([]);
  expect(submitted().get('columns-108')).toBe('value');
  const fieldset = form.querySelector('fieldset');
  expect(fieldset?.querySelector('legend')?.className).toBe(
    'govuk-fieldset__legend govuk-visually-hidden',
  );
  expect(fieldset?.getAttribute('aria-describedby')).toBe(form.querySelector('.govuk-hint')?.id);
  expect(form.querySelector('.govuk-checkboxes--small')?.getAttribute('data-module')).toBe(
    'govuk-checkboxes',
  );
});

it('offers only England when no selected area has a statistical region', () => {
  const Routes = benchmarkRoutes(false);
  render(<Routes initialEntries={['/']} />);
  expect(screen.getByRole('checkbox', { name: 'England' })).toBeTruthy();
  expect(screen.queryByRole('checkbox', { name: 'Statistical regions' })).toBeNull();
});

it.each(['', 'columns-108=value,minmax', 'columns-108=none'])(
  'preserves the effective columns in a no-benchmark form submission for %s',
  (query) => {
    const available = ['count', '95'];
    const columns = selectedTrendColumns(new URLSearchParams(query), 108, available);
    const Routes = createRoutesStub([
      {
        path: '/',
        Component: () => (
          <PanelOptionsPanel
            label="Options"
            scope={108}
            columns={columns}
            onColumnsChange={() => {}}
            rangeBenchmarks={false}
            measures={['count']}
            confidenceLevels={['95']}
            periodTypes={['1-year']}
            sexes={[]}
            showConfidence
            options={{ benchmarks: [], confidence: 'none', periodType: 'all', sex: '' }}
            onChange={() => {}}
            target={{ tabParam: 'tab-indicator', tabValue: 'indicator', anchor: 'indicator-data' }}
          />
        ),
      },
    ]);
    render(<Routes initialEntries={[`/?${query}`]} />);
    expect(screen.queryByRole('checkbox', { name: 'Minimum/Maximum values' })).toBeNull();
    const form = screen.getByRole('checkbox', { name: 'Calculated value' }).closest('form');
    if (!form) throw new Error('Options form missing');
    const params = new URLSearchParams();
    for (const [name, value] of new FormData(form)) params.append(name, String(value));
    expect(selectedTrendColumns(params, 108, available)).toEqual(columns);
    params.set('cmp-108', 'england');
    expect(selectedTrendColumns(params, 108, available)).toEqual(columns);
  },
);

it.each(['chart', 'compare-areas', 'table'] as const)(
  'preserves selections for absent controls in a %s form submission',
  (panel) => {
    const Routes = createRoutesStub([
      {
        path: '/',
        Component: () => (
          <PanelOptionsPanel
            panel={panel}
            label="Options"
            scope={108}
            confidenceLevels={[]}
            periodTypes={['1-year']}
            sexes={[]}
            showConfidence={false}
            options={{
              benchmarks: [],
              confidence: '95',
              periodType: '3-year',
              sex: 'Female',
            }}
            onChange={() => {}}
            target={{ tabParam: 'tab-indicator', tabValue: 'indicator', anchor: 'indicator-data' }}
          />
        ),
      },
    ]);
    render(
      <Routes
        initialEntries={['/?ci-108=95&sex-108=Female&pt-108=3-year&cr-108=yes&cr-compare=no']}
      />,
    );
    const form = screen.getByText('Options').closest('details')?.querySelector('form');
    expect(form).toBeTruthy();
    if (!form) throw new Error('Options form missing');
    const submitted = new FormData(form);
    expect(submitted.getAll('ci-108')).toEqual(['95']);
    expect(submitted.getAll('sex-108')).toEqual(['Female']);
    expect(submitted.getAll('pt-108')).toEqual(['3-year']);
    expect(submitted.has('cr-108')).toBe(false);
    expect(submitted.has('cr-compare')).toBe(false);
  },
);

it.each([108, 'compare'] as const)(
  'drops obsolete range options on a %s option change',
  async (scope) => {
    const Routes = createRoutesStub([
      {
        path: '/',
        Component: () => {
          const [options, update] = usePanelOptions(scope);
          const location = useLocation();
          return (
            <>
              <button type="button" onClick={() => update({ ...options, sex: 'Male' })}>
                Change sex
              </button>
              <output>{location.search}</output>
            </>
          );
        },
      },
    ]);
    render(<Routes initialEntries={['/?cr-108=yes&cr-compare=no&as=E08000003']} />);
    fireEvent.click(screen.getByRole('button', { name: 'Change sex' }));
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain(`sex-${scope}=Male`),
    );
    const params = new URLSearchParams(screen.getByRole('status').textContent ?? '');
    expect(params.has('cr-108')).toBe(false);
    expect(params.has('cr-compare')).toBe(false);
    expect(params.has(`cmp-${scope}`)).toBe(false);
    expect(params.get('as')).toBe('E08000003');
  },
);

it.each([108, 'compare'] as const)(
  'keeps every benchmark when changing another option in scope %s',
  async (scope) => {
    const Routes = createRoutesStub([
      {
        path: '/',
        Component: () => {
          const [options, update] = usePanelOptions(scope);
          const location = useLocation();
          return (
            <>
              <button type="button" onClick={() => update({ ...options, sex: 'Male' })}>
                Change sex
              </button>
              <output>{location.search}</output>
            </>
          );
        },
      },
    ]);
    render(
      <Routes initialEntries={[`/?cmp-${scope}=&cmp-${scope}=region&cmp-${scope}=england`]} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Change sex' }));
    await waitFor(() =>
      expect(
        new URLSearchParams(screen.getByRole('status').textContent ?? '').get(`sex-${scope}`),
      ).toBe('Male'),
    );
    expect(
      selectedBenchmarks(new URLSearchParams(screen.getByRole('status').textContent ?? ''), scope),
    ).toEqual(['england', 'region']);
  },
);

it('submits visible controls once without hidden copies of their previous values', () => {
  const Routes = createRoutesStub([
    {
      path: '/',
      Component: () => (
        <PanelOptionsPanel
          label="Options"
          scope={108}
          confidenceLevels={['95']}
          periodTypes={['1-year', '3-year']}
          sexes={['Female', 'Male']}
          showConfidence
          options={{
            benchmarks: [],
            confidence: '95',
            periodType: '3-year',
            sex: 'Female',
          }}
          onChange={() => {}}
          target={{ tabParam: 'tab-indicator', tabValue: 'indicator', anchor: 'indicator-data' }}
        />
      ),
    },
  ]);
  render(<Routes initialEntries={['/?ci-108=95&sex-108=Female&pt-108=3-year']} />);
  const form = screen.getByLabelText('Select sex').closest('form');
  if (!form) throw new Error('Options form missing');
  const submitted = new FormData(form);
  expect(submitted.getAll('ci-108')).toEqual(['95']);
  expect(submitted.getAll('sex-108')).toEqual(['Female']);
  expect(submitted.getAll('pt-108')).toEqual(['3-year']);
});
