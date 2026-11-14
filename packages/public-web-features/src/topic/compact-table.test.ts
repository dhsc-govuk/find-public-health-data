import { expect, it } from 'vitest';
import { observation, selected, sex } from '../indicator/view.testing.ts';
import { compactTopicAreaTable, compactTopicDataTable, expandTopicTable } from './compact-table.ts';
import { topicAreaTableModel, topicDataTableModel } from './table-models.ts';

function entry(shortId = 108) {
  const source = selected(shortId);
  return { ...source, detail: { ...source.detail, topics: [] } };
}

it('preserves table measures, trends, row metadata and area ordering after hydration', () => {
  const model = topicDataTableModel([entry(), entry(241)], 'diabetes');
  const compact = compactTopicDataTable(model);
  expect(expandTopicTable(JSON.parse(JSON.stringify(compact)))).toEqual(model);
  expect(compact.trends.length).toBeLessThan(model.rows.flatMap(({ cells }) => cells).length);
});

it('preserves comparisons and lagging periods through JSON hydration', () => {
  const source = entry();
  const area = source.areaData.find(({ areaCode }) => areaCode !== 'E92000001');
  const england = source.areaData.find(({ areaCode }) => areaCode === 'E92000001');
  if (!area || !england) throw new Error('Area fixture missing');
  england.observations.push({
    ...observation(21, [sex('Female')]),
    fromDate: '2023-01-01',
    toDate: '2023-12-31',
  });
  source.areaData.push({
    ...structuredClone(area),
    areaCode: 'lagging',
    areaName: 'Lagging area',
    observations: area.observations.map((point) => ({
      ...point,
      fromDate: '2023-01-01',
      toDate: '2023-12-31',
    })),
  });
  const model = topicDataTableModel([source], 'diabetes');
  expect(model.rows[0]?.cells.find(({ areaCode }) => areaCode === 'lagging')).toMatchObject({
    period: '2023',
    judgement: 'better',
    benchmark: { value: 21, period: '2023' },
  });
  const compact = compactTopicDataTable(model);
  expect(expandTopicTable(JSON.parse(JSON.stringify(compact)))).toEqual(model);
});

it('preserves area judgements, missing values and footnotes after hydration', () => {
  const source = entry();
  for (const area of source.areaData)
    for (const point of area.observations)
      point.notes = [{ text: 'Provisional <data> & "notes"', category: 'Value note' }];
  source.areaData.push({ areaCode: 'empty', areaName: 'No data', observations: [] });
  const model = topicAreaTableModel(
    [source, { ...source, detail: { ...source.detail, shortId: 241 } }],
    { regionByCode: {}, levelByCode: {} },
    'diabetes',
  );
  const compact = compactTopicAreaTable(model);
  expect(expandTopicTable(JSON.parse(JSON.stringify(compact)))).toEqual(model);
  expect(compact.notes).toContainEqual(['Provisional <data> & "notes"']);
});
