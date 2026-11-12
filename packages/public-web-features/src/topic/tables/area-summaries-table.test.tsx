// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it } from 'vitest';
import { indicatorDetail, observation } from '../../indicator/view.testing.ts';
import { topicAreaTableModel } from '../table-models.ts';
import { AreaSummariesTable } from './area-summaries-table.tsx';

afterEach(cleanup);

it.each([
  [
    'lower-is-better',
    'first',
    'best to worst',
    'worst to best',
    'ascending',
    ['North East', 'London'],
  ],
  [
    'lower-is-better',
    'reverse',
    'worst to best',
    'best to worst',
    'descending',
    ['London', 'North East'],
  ],
  [
    'higher-is-better',
    'first',
    'best to worst',
    'worst to best',
    'descending',
    ['London', 'North East'],
  ],
  [
    'higher-is-better',
    'reverse',
    'worst to best',
    'best to worst',
    'ascending',
    ['North East', 'London'],
  ],
  [
    'no-polarity',
    'first',
    'highest to lowest',
    'lowest to highest',
    'descending',
    ['London', 'North East'],
  ],
  [
    'no-polarity',
    'reverse',
    'lowest to highest',
    'highest to lowest',
    'ascending',
    ['North East', 'London'],
  ],
] as const)(
  'describes %s columns in %s order consistently with their values',
  (polarity, order, current, next, direction, areas) => {
    const model = topicAreaTableModel(
      [
        {
          detail: indicatorDetail(1, { name: 'Example indicator', polarity }),
          areaData: [
            { areaCode: 'E92000001', areaName: 'England', observations: [observation(10)] },
            { areaCode: 'E12000007', areaName: 'London', observations: [observation(20)] },
            { areaCode: 'E12000001', areaName: 'North East', observations: [observation(5)] },
          ],
        },
      ],
      { regionByCode: {}, levelByCode: {} },
      'example',
    );
    render(
      <MemoryRouter>
        <AreaSummariesTable
          model={model}
          params={new URLSearchParams({ sortAreas: `${order}:1|` })}
          path="/topics/example"
          topicTitle="Example"
          geographyGroup="Statistical regions"
        />
      </MemoryRouter>,
    );
    const table = within(
      screen.getByRole('table', {
        name: `Example indicators by statistical region, sorted by Example indicator, ${current}`,
      }),
    );
    expect(table.getByRole('rowheader').getAttribute('aria-sort')).toBe(direction);
    expect(
      table.getByRole('link', { name: new RegExp(`^Sort ${next}\\s*for Example indicator$`) }),
    ).toBeTruthy();
    expect(
      table
        .getAllByRole('columnheader')
        .slice(4)
        .map((cell) => cell.textContent),
    ).toEqual(areas);
    expect(
      table
        .getAllByRole('cell')
        .slice(3)
        .map((cell) => Number(cell.firstChild?.textContent)),
    ).toEqual(direction === 'ascending' ? [5, 20] : [20, 5]);
  },
);
