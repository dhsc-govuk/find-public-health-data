import { dataDictionary, dictionaryEntry } from '../data-dictionary.ts';
import type { TopicAreaTableModel, TopicDataTableModel } from './table-models.ts';

type DataCell = [
  areaCode: string,
  value: number | null,
  count: number | null,
  numerator: number | null,
  trend: number,
];
type AreaCell = [
  areaCode: string,
  value: number | null,
  notes: number,
  period: string,
  judgement: TopicAreaTableModel['rows'][number]['cells'][number]['judgement'],
];

export function compactTopicDataTable(model: TopicDataTableModel) {
  const trends = dataDictionary<TopicDataTableModel['rows'][number]['cells'][number]['trend']>();
  const rows = model.rows.map((row) => ({
    ...row,
    cells: row.cells.map(
      (cell): DataCell => [
        cell.areaCode,
        cell.value,
        cell.count,
        cell.numerator,
        trends.index(cell.trend),
      ],
    ),
  }));
  return { ...model, rows, trends: trends.entries };
}

export function compactTopicAreaTable(model: TopicAreaTableModel) {
  const notes = dataDictionary<string[]>();
  const rows = model.rows.map((row) => ({
    ...row,
    cells: row.cells.map(
      (cell): AreaCell => [
        cell.areaCode,
        cell.value,
        notes.index(cell.notes),
        cell.period,
        cell.judgement,
      ],
    ),
  }));
  return { ...model, rows, notes: notes.entries };
}

export function expandTopicTable(
  model: ReturnType<typeof compactTopicDataTable> | ReturnType<typeof compactTopicAreaTable>,
): TopicDataTableModel | TopicAreaTableModel {
  if (model.kind === 'data') {
    const { trends, ...table } = model;
    return {
      ...table,
      rows: table.rows.map((row) => ({
        ...row,
        cells: row.cells.map(([areaCode, value, count, numerator, trend]) => ({
          areaCode,
          value,
          count,
          numerator,
          trend: dictionaryEntry(trends, trend),
        })),
      })),
    };
  }
  const { notes, ...table } = model;
  return {
    ...table,
    rows: table.rows.map((row) => ({
      ...row,
      cells: row.cells.map(([areaCode, value, note, period, judgement]) => ({
        areaCode,
        value,
        notes: dictionaryEntry(notes, note),
        period,
        judgement,
      })),
    })),
  };
}
