import { TableScrollRegion } from '@fphd/ui';
import { indicatorPath } from '@fphd/utils/indicator-path';
import { memo, useRef } from 'react';
import { Link } from 'react-router';
import { formatCalculatedValue } from '../../indicator/data.ts';
import { NoteFootnotes, noteMarker } from '../../indicator/tables/note-markers.tsx';
import { JUDGEMENT_LABELS } from '../data.ts';
import { sortTopicAreaTable, type TopicAreaTableModel } from '../table-models.ts';

type AreaSummaryRow = TopicAreaTableModel['rows'][number];

const GEOGRAPHY_LABELS: Record<string, string> = {
  'Integrated care boards': 'integrated care board',
  'Local authorities': 'upper-tier local authority',
  'NHS regions': 'NHS region',
  'Statistical regions': 'statistical region',
};

function areaOrderLabel(row: AreaSummaryRow, reverse: boolean) {
  if (row.goodDirection) return reverse ? 'worst to best' : 'best to worst';
  return reverse ? 'lowest to highest' : 'highest to lowest';
}

function indicatorName(row: AreaSummaryRow) {
  return row.suffix ? `${row.name} ${row.suffix}` : row.name;
}

export const AreaSummariesTable = memo(function AreaSummariesTable({
  model,
  params,
  path,
  topicTitle,
  geographyGroup,
}: {
  model: TopicAreaTableModel;
  params: URLSearchParams;
  path: string;
  topicTitle: string;
  geographyGroup: string | undefined;
}) {
  const { areas: pickedAreas, rows, columnSort } = sortTopicAreaTable(model, params);
  const activeSortLink = useRef<HTMLAnchorElement>(null);
  const canSortAreas = pickedAreas.length > 1;
  const sortedRow = rows.find(({ key }) => key === columnSort?.key);
  const geographyLabel = GEOGRAPHY_LABELS[geographyGroup ?? ''] ?? 'area';
  const caption = `${topicTitle} indicators by ${geographyLabel}`;
  const sortUrl = (value?: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set('sortAreas', value);
    else next.delete('sortAreas');
    return `${path}?${next}#topic-area-summaries`;
  };
  const noteTexts = [
    ...new Set(
      rows.flatMap((row) => [...row.cells.flatMap(({ notes }) => notes), ...row.england.notes]),
    ),
  ];
  return (
    <>
      <ul className="govuk-list fphd-rug-key" aria-label="Comparison key">
        {Object.entries(JUDGEMENT_LABELS)
          .filter(([key]) => ['better', 'similar', 'worse', 'none'].includes(key))
          .map(([judgement, label]) => (
            <li key={judgement}>
              <span
                className={`fphd-rug-key__swatch fphd-rug-cell--${judgement}`}
                aria-hidden="true"
              />
              {judgement === 'none'
                ? 'Not compared (higher or lower is neither better nor worse)'
                : label}
            </li>
          ))}
        <li>No data</li>
      </ul>
      <TableScrollRegion label={caption}>
        <table className="govuk-table fphd-compare-table fphd-rug-table">
          <caption className="govuk-table__caption govuk-table__caption--s">
            {caption}
            {columnSort && sortedRow
              ? `, sorted by ${indicatorName(sortedRow)}, ${areaOrderLabel(sortedRow, columnSort.reverse)}`
              : ''}
          </caption>
          <colgroup>
            <col />
            <col />
            <col />
            {canSortAreas ? <col /> : null}
            {Array.from({ length: pickedAreas.length }, (_, index) => (
              <col key={index} />
            ))}
          </colgroup>
          <thead className="govuk-table__head">
            <tr className="govuk-table__row">
              <th className="govuk-table__header" scope="col">
                Indicator
              </th>
              <th className="govuk-table__header" scope="col">
                Latest period
              </th>
              <th className="govuk-table__header" scope="col">
                England
              </th>
              {canSortAreas ? (
                <th className="govuk-table__header" scope="col">
                  Sort areas by this indicator
                </th>
              ) : null}
              {pickedAreas.map(({ areaCode, areaName }) => (
                <th className="govuk-table__header" scope="col" key={areaCode}>
                  {areaName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="govuk-table__body">
            {rows.map((row) => {
              const england = row.england;
              const englandPeriod = england.period;
              const activeSort = columnSort?.key === row.key ? columnSort : null;
              const reverseOnClick = activeSort?.reverse === false;
              const sortStatus = activeSort
                ? `Areas sorted ${areaOrderLabel(row, activeSort.reverse)}`
                : null;
              return (
                <tr className="govuk-table__row" key={row.key}>
                  <th aria-sort={activeSort?.direction} className="govuk-table__header" scope="row">
                    <Link className="govuk-link" to={indicatorPath(row.slug)}>
                      {row.name}
                    </Link>
                    {row.suffix ? ` ${row.suffix}` : ''}
                    {row.subtopics.map((subtopic) => (
                      <span className="fphd-rug-cell__label fphd-topic-subtopic" key={subtopic}>
                        {subtopic}
                      </span>
                    ))}
                    <span className="fphd-rug-cell__label">Unit: {row.unit}</span>
                    {sortStatus ? (
                      <div aria-hidden="true" className="govuk-!-margin-top-1">
                        <strong className="govuk-tag govuk-tag--blue">{sortStatus}</strong>
                      </div>
                    ) : null}
                  </th>
                  <td className="govuk-table__cell">{row.period || 'No data'}</td>
                  <td className="govuk-table__cell">
                    {england?.value == null ? (
                      'No data'
                    ) : (
                      <>
                        {formatCalculatedValue(england.value)}
                        {england.notes.map((text) => (
                          <sup key={text}>{noteMarker(noteTexts, text)}</sup>
                        ))}
                      </>
                    )}
                    {englandPeriod !== row.period && england?.value != null ? (
                      <span className="fphd-rug-cell__label">{englandPeriod}</span>
                    ) : null}
                  </td>
                  {canSortAreas ? (
                    <td className="govuk-table__cell fphd-rug-table__sort">
                      <Link
                        ref={activeSort ? activeSortLink : undefined}
                        className="govuk-link govuk-body-s"
                        to={sortUrl(`${reverseOnClick ? 'reverse' : 'first'}:${row.key}`)}
                        preventScrollReset
                      >
                        Sort {areaOrderLabel(row, reverseOnClick)}
                        <span className="govuk-visually-hidden"> for {indicatorName(row)}</span>
                      </Link>
                      {sortStatus ? (
                        <div className="govuk-!-margin-top-1">
                          <span className="govuk-visually-hidden">{sortStatus}. </span>
                          <Link
                            className="govuk-link govuk-body-s"
                            to={sortUrl()}
                            preventScrollReset
                            onClick={(event) => {
                              if (
                                event.button === 0 &&
                                !event.metaKey &&
                                !event.ctrlKey &&
                                !event.shiftKey &&
                                !event.altKey
                              ) {
                                activeSortLink.current?.focus({ preventScroll: true });
                              }
                            }}
                          >
                            Clear sort
                            <span className="govuk-visually-hidden"> by {indicatorName(row)}</span>
                          </Link>
                        </div>
                      ) : null}
                    </td>
                  ) : null}
                  {row.cells.map((cell) => {
                    const { judgement, period } = cell;
                    return (
                      <td
                        className={`govuk-table__cell${cell.value === null ? '' : ` fphd-rug-cell--${judgement}`}`}
                        key={cell.areaCode}
                      >
                        {cell.value === null ? (
                          'No data'
                        ) : (
                          <>
                            {formatCalculatedValue(cell.value)}
                            {cell.notes.map((text) => (
                              <sup key={text}>{noteMarker(noteTexts, text)}</sup>
                            ))}
                            <span
                              className={
                                judgement === 'none'
                                  ? 'govuk-visually-hidden'
                                  : 'fphd-rug-cell__label'
                              }
                            >
                              {judgement === 'none'
                                ? 'No comparison'
                                : judgement.charAt(0).toUpperCase() + judgement.slice(1)}
                              {judgement !== 'none' ? (
                                <span className="govuk-visually-hidden">
                                  {judgement === 'similar' ? ' to England' : ' than England'}
                                </span>
                              ) : null}
                            </span>
                            {period !== row.period ? (
                              <span className="fphd-rug-cell__label">{period}</span>
                            ) : null}
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableScrollRegion>
      <NoteFootnotes noteTexts={noteTexts} />
    </>
  );
});
