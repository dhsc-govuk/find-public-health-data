// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRoutesStub, useLocation } from 'react-router';
import { afterEach, expect, it } from 'vitest';
import { PanelOptionsPanel, usePanelOptions } from './options.tsx';

afterEach(cleanup);

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
              benchmark: 'none',
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
    expect(params.get('as')).toBe('E08000003');
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
            benchmark: 'none',
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
