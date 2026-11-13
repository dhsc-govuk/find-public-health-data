import { expect, it } from 'vitest';
import { selected } from '../indicator/view.testing.ts';
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
