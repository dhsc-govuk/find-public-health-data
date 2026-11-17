import { type ReactNode, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ErrorBar,
  Label,
  LabelList,
  ReferenceLine,
  Tooltip,
  usePlotArea,
  useXAxisScale,
  XAxis,
  YAxis,
} from 'recharts';
import { type BenchmarkJudgement, type ConfidenceLevel, formatValue, unitNote } from '../data.ts';
import type { IndicatorObservation, IndicatorPageDetail } from '../loader.ts';
import {
  type BarColourMode,
  barComparison,
  barComparisonText,
  barMean,
  barPalettes,
} from './bar-comparison.ts';
import { bounds, errorOffsets, quintileColours, quintileLabel } from './chart-data.ts';
import {
  axisColour,
  ChartCanvas,
  ChartDataTable,
  chartValue,
  gridColour,
  NoChartData,
  PositionedChartTooltip,
  seriesColours,
  useChartSelection,
} from './chart-elements.tsx';

export function wrapCategory(name: string, characters: number) {
  const lines: string[] = [];
  for (const word of name.split(' ')) {
    const last = lines.at(-1);
    if (last && last.length + word.length + 1 <= characters)
      lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
}

function BarTooltip({
  rows,
  active,
  container,
  colour,
  children,
}: {
  rows: BarRow[];
  active: string | null;
  container: HTMLDivElement | null;
  colour: (row: BarRow) => string;
  children: (row: BarRow) => ReactNode;
}) {
  const x = useXAxisScale();
  const plot = usePlotArea();
  const index = rows.findIndex(({ key }) => key === active);
  const row = rows[index];
  if (!x || !plot || !row || row.observation?.value == null) return null;
  const zero = x(0);
  const end = x(row.observation.value);
  if (zero == null || end == null) return null;
  return (
    <PositionedChartTooltip
      container={container}
      x={(zero + end) / 2}
      y={plot.y + ((index + 0.5) * plot.height) / rows.length}
      colour={colour(row)}
    >
      {children(row)}
    </PositionedChartTooltip>
  );
}

export interface BarRow {
  key: string;
  name: string;
  observation: IndicatorObservation | undefined;
  comparison?: BenchmarkJudgement;
  quintile?: number | null;
}

const comparisonColours = {
  better: '#8ed973',
  worse: '#c00000',
  similar: '#ffc000',
  higher: '#5555e6',
  lower: '#bed2ff',
  none: axisColour,
} satisfies Record<BenchmarkJudgement, string>;

const comparisonText = {
  better: 'Better than England',
  worse: 'Worse than England',
  similar: 'Similar to England',
  higher: 'Higher than England',
  lower: 'Lower than England',
  none: 'Not compared with England',
} satisfies Record<BenchmarkJudgement, string>;

export function ObservationBars({
  rows: unsortedRows,
  confidence,
  indicator,
  title,
  group,
  averageEntity,
  benchmark: suppliedBenchmark,
  colourMode = 'magnitude',
  comparisonConfidence = '95',
  colourByQuintile = false,
  showTable = true,
}: {
  rows: BarRow[];
  confidence: ConfidenceLevel;
  indicator: IndicatorPageDetail;
  title: string;
  group: string;
  averageEntity?: string;
  benchmark?: { name: string; value: number };
  colourMode?: BarColourMode;
  comparisonConfidence?: ConfidenceLevel;
  colourByQuintile?: boolean;
  showTable?: boolean;
}) {
  const selection = useChartSelection<string>();
  const active = selection.active;
  const rows = [...unsortedRows].sort(
    (a, b) => (b.observation?.value ?? -Infinity) - (a.observation?.value ?? -Infinity),
  );
  const mean = barMean(rows.map(({ observation }) => observation?.value));
  const benchmark =
    suppliedBenchmark ??
    (averageEntity && mean !== null ? { name: averageEntity, value: mean } : undefined);
  const benchmarkTitle = suppliedBenchmark ? benchmark?.name : `${benchmark?.name} average`;
  const mode =
    colourMode === 'rag' && indicator.polarity === 'higher-is-better' ? 'rag' : 'magnitude';
  const comparison = (row: BarRow) =>
    benchmark
      ? barComparison(
          row.observation,
          benchmark.value,
          comparisonConfidence === '99.8' ? '99.8' : '95',
        )
      : null;
  const [width, setWidth] = useState(640);
  const colour = (row: BarRow) => {
    if (colourByQuintile) return quintileColours[(row.quintile ?? 0) - 1] ?? axisColour;
    if (suppliedBenchmark) return comparisonColours[row.comparison ?? 'none'];
    const status = comparison(row);
    return benchmark && status ? barPalettes[mode][status] : seriesColours[0];
  };
  const comparisonLabel = (row: BarRow) => {
    if (colourByQuintile)
      return row.quintile ? quintileLabel(row.quintile) : 'Quintile unavailable';
    if (suppliedBenchmark) return comparisonText[row.comparison ?? 'none'];
    return barComparisonText(comparison(row), mode);
  };
  const key = colourByQuintile
    ? [
        ...new Set(
          rows
            .filter(({ observation }) => observation?.value != null)
            .map(({ quintile }) => quintile ?? null),
        ),
      ]
        .sort((a, b) => (a ?? 6) - (b ?? 6))
        .map((quintile) => ({
          fill: quintileColours[(quintile ?? 0) - 1] ?? axisColour,
          label: quintile ? quintileLabel(quintile) : 'Quintile unavailable',
        }))
    : benchmark
      ? [
          ...new Map(
            rows
              .filter(({ observation }) => observation?.value != null)
              .map((row) => [
                comparisonLabel(row),
                { fill: colour(row), label: comparisonLabel(row) },
              ]),
          ).values(),
        ]
      : [];
  const labelWidth = Math.min(190, Math.max(100, Math.round(width * 0.36)));
  const labelCharacters = Math.max(10, Math.floor((labelWidth - 12) / 8));
  const lines = (name: string) => wrapCategory(name, labelCharacters);
  const rowHeight = Math.max(34, ...rows.map(({ name }) => lines(name).length * 18 + 12));
  const valueWidth = Math.max(
    68,
    ...rows.map(
      ({ observation }) => chartValue(observation?.value ?? null, indicator.unit).length * 8 + 12,
    ),
  );
  const names = new Map(rows.map(({ key, name }) => [key, name]));
  const data = rows.map(({ key, observation }) => ({
    key,
    value: observation?.value ?? null,
    error: errorOffsets(observation?.value ?? null, bounds(observation, confidence)),
  }));
  if (!data.some(({ value }) => value !== null)) return <NoChartData />;
  const formatName = (key: string) => names.get(key) ?? key;
  const interval = (row: BarRow) => {
    const range = bounds(row.observation, confidence);
    return range ? range.map((value) => chartValue(value, indicator.unit)).join(' to ') : 'No data';
  };
  return (
    <>
      <ChartCanvas
        chartRef={selection.ref}
        height={Math.max(220, data.length * rowHeight + 120)}
        onResize={setWidth}
        onKeyDown={(event) => {
          if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(event.key))
            return;
          event.preventDefault();
          const current = rows.findIndex(({ key }) => key === active);
          const step = event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1;
          const index =
            event.key === 'Enter'
              ? Math.max(0, current)
              : Math.max(0, Math.min(rows.length - 1, current + step));
          const row = rows[index];
          if (row) {
            if (event.key === 'Enter') selection.pin(row.key);
            else selection.select(row.key);
          }
        }}
      >
        {(descriptionId) => (
          <BarChart
            accessibilityLayer
            aria-label={title}
            aria-describedby={descriptionId}
            data={data}
            layout="vertical"
            margin={{ right: valueWidth, top: 65, bottom: 5 }}
            onMouseMove={({ activeLabel }) =>
              selection.select(activeLabel == null ? null : String(activeLabel))
            }
            onMouseLeave={selection.leave}
            onClick={(state, event) => {
              if (
                state.activeLabel != null &&
                event.target instanceof Element &&
                event.target.closest('.recharts-bar-rectangle')
              )
                selection.pin(String(state.activeLabel));
              else selection.clear();
            }}
          >
            <CartesianGrid horizontal={false} stroke={gridColour} strokeDasharray="3 3" />
            <YAxis
              type="category"
              dataKey="key"
              interval={0}
              width={labelWidth}
              tick={({ x, y, payload }) => {
                const name = formatName(String(payload.value));
                const words = lines(name);
                return (
                  <text className="recharts-text" x={Number(x) - 8} y={y} textAnchor="end">
                    <title>{name}</title>
                    {words.map((line, index) => (
                      <tspan
                        key={line + index}
                        x={Number(x) - 8}
                        dy={index === 0 ? -((words.length - 1) * 9) + 5 : 18}
                      >
                        {line}
                      </tspan>
                    ))}
                  </text>
                );
              }}
              axisLine={{ stroke: axisColour }}
              tickLine={false}
            >
              <Label
                content={({ viewBox }) =>
                  viewBox && 'x' in viewBox && 'width' in viewBox && 'y' in viewBox ? (
                    <text
                      className="recharts-text fphd-bar-axis-title"
                      x={Number(viewBox.x) + Number(viewBox.width)}
                      y={Number(viewBox.y) - 20}
                      textAnchor="middle"
                    >
                      {group}
                    </text>
                  ) : null
                }
              />
            </YAxis>
            <XAxis
              type="number"
              domain={[(min: number) => Math.min(0, min), (max: number) => Math.max(0, max)]}
              tickFormatter={formatValue}
              axisLine={{ stroke: axisColour }}
              height={46}
            >
              <Label
                value={`Calculated value${unitNote(indicator.unit)}`}
                position="insideBottom"
              />
            </XAxis>
            <Tooltip cursor={false} content={() => null} />
            <Bar
              dataKey="value"
              name="Calculated value"
              fill={seriesColours[0]}
              maxBarSize={23}
              isAnimationActive={false}
              activeBar={false}
            >
              {rows.map((row) => (
                <Cell
                  key={row.key}
                  fill={active === null || active === row.key ? colour(row) : gridColour}
                  stroke={colourByQuintile ? '#0b0c0c' : '#505a5f'}
                  strokeWidth={0.6}
                />
              ))}
              <LabelList
                dataKey="value"
                position="right"
                className="fphd-bar-value"
                formatter={(value) =>
                  typeof value === 'number' ? chartValue(value, indicator.unit) : ''
                }
              />
              {confidence !== 'none' ? (
                <ErrorBar dataKey="error" stroke="#0b0c0c" width={3} isAnimationActive={false} />
              ) : null}
            </Bar>
            {benchmark ? (
              <ReferenceLine
                x={benchmark.value}
                ifOverflow="extendDomain"
                stroke="#000000"
                strokeWidth={1}
                label={{
                  value: `${benchmarkTitle} ${chartValue(benchmark.value, indicator.unit)}`,
                  position: 'top',
                  fontWeight: 700,
                  fontSize: 16,
                }}
              />
            ) : null}
            <BarTooltip
              rows={rows}
              active={active}
              container={selection.ref.current}
              colour={colour}
            >
              {(row) => (
                <>
                  <div>
                    <strong>{group}:</strong> {row.name}
                  </div>
                  <div>
                    <strong>Value:</strong>{' '}
                    {chartValue(row.observation?.value ?? null, indicator.unit)}
                  </div>
                  {benchmark ? (
                    <>
                      <div>
                        <strong>{benchmarkTitle}:</strong>{' '}
                        {chartValue(benchmark.value, indicator.unit)}
                      </div>
                      <div>
                        <strong>Comparison:</strong> {comparisonLabel(row)}
                      </div>
                    </>
                  ) : null}
                  {confidence !== 'none' ? (
                    <div>
                      <strong>{confidence}% confidence interval:</strong> {interval(row)}
                    </div>
                  ) : null}
                  {colourByQuintile ? (
                    <div>
                      <strong>Quintile:</strong> {comparisonLabel(row)}
                    </div>
                  ) : null}
                </>
              )}
            </BarTooltip>
          </BarChart>
        )}
      </ChartCanvas>
      {key.length > 0 ? (
        <ul
          className="govuk-list fphd-chart-key"
          aria-label={colourByQuintile ? 'Quintile key' : 'Comparison key'}
        >
          {key.map(({ fill, label }) => (
            <li key={label}>
              <svg width="15" height="15" aria-hidden="true">
                <rect x="0.5" y="0.5" width="14" height="14" fill={fill} stroke="#0b0c0c" />
              </svg>
              {label}
            </li>
          ))}
        </ul>
      ) : null}
      {showTable ? (
        <ChartDataTable
          title={title}
          columns={[
            group,
            `Calculated value${unitNote(indicator.unit)}`,
            ...(confidence === 'none' ? [] : [`${confidence}% confidence interval`]),
            ...(colourByQuintile ? ['Quintile'] : benchmark ? ['Comparison'] : []),
          ]}
          rows={rows.map((row) => ({
            key: row.key,
            label: row.name,
            values: [
              chartValue(row.observation?.value ?? null, indicator.unit),
              ...(confidence === 'none' ? [] : [interval(row)]),
              ...(benchmark || colourByQuintile ? [comparisonLabel(row)] : []),
            ],
          }))}
        />
      ) : null}
    </>
  );
}
