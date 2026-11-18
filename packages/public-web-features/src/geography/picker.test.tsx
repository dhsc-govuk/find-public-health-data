// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { createRoutesStub } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { GeographyPicker } from './picker.tsx';

afterEach(cleanup);

it('preserves a click across an unchanged selection refresh and accepts a changed selection', () => {
  const apply = vi.fn();
  const level = 'Upper-tier local authorities';
  const Routes = createRoutesStub([
    {
      path: '/',
      Component: () => {
        const [selection, setSelection] = useState({
          areaCodes: ['E08000003'],
          areaLevels: [] as string[],
        });
        return (
          <>
            <GeographyPicker
              action="/"
              displayGroups={[level]}
              geographyOptions={{
                query: '',
                level,
                groups: [{ name: level, areas: [{ code: 'E08000003', name: 'Manchester' }] }],
                error: false,
              }}
              levelName="als"
              name="as"
              choicesLabel="Geography choices for Indicator"
              onApply={(next) => {
                apply(next);
                setSelection(structuredClone(selection));
              }}
              selection={selection}
            >
              <input name="cmp-108" type="hidden" value="" />
            </GeographyPicker>
            <button
              type="button"
              onClick={() => setSelection({ areaCodes: [], areaLevels: [level] })}
            >
              Select whole level
            </button>
          </>
        );
      },
    },
  ]);
  render(<Routes initialEntries={['/']} />);
  const manchester = screen.getByRole('checkbox', { name: 'Manchester' }) as HTMLInputElement;
  fireEvent.click(manchester);
  expect(apply).toHaveBeenCalledWith({ areaCodes: [], areaLevels: [] });
  expect(manchester.checked).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Select whole level' }));
  expect(
    (screen.getByRole('checkbox', { name: /Upper-tier local authorities/ }) as HTMLInputElement)
      .checked,
  ).toBe(true);
  expect(manchester.checked).toBe(false);
});
