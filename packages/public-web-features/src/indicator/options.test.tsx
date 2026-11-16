// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { createRoutesStub } from 'react-router';
import { afterEach, expect, it } from 'vitest';
import { PanelOptionsPanel } from './options.tsx';

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
              range: false,
              sex: 'Female',
            }}
            onChange={() => {}}
            target={{ tabParam: 'tab-indicator', tabValue: 'indicator', anchor: 'indicator-data' }}
          />
        ),
      },
    ]);
    render(<Routes initialEntries={['/?ci-108=95&sex-108=Female&pt-108=3-year']} />);
    const form = screen.getByText('Options').closest('details')?.querySelector('form');
    expect(form).toBeTruthy();
    if (!form) throw new Error('Options form missing');
    const submitted = new FormData(form);
    expect(submitted.getAll('ci-108')).toEqual(['95']);
    expect(submitted.getAll('sex-108')).toEqual(['Female']);
    expect(submitted.getAll('pt-108')).toEqual(['3-year']);
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
            range: false,
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
