export const fitColour = '#ca3535';
export const scatterMarks = {
  england: { fill: '#12436d' },
  selected: { fill: '#801650' },
  other: { fill: '#bfbfbf' },
} as const;

export function ScatterMark({
  cx,
  cy,
  kind,
  legend = false,
}: {
  cx: number;
  cy: number;
  kind: keyof typeof scatterMarks;
  legend?: boolean;
}) {
  const fill = scatterMarks[kind].fill;
  const radius = legend ? 7 : 8;
  return kind === 'selected' ? (
    <polygon
      points={`${cx},${cy - radius} ${cx + radius},${cy} ${cx},${cy + radius} ${cx - radius},${cy}`}
      fill={fill}
      stroke={legend ? undefined : '#fff'}
      strokeWidth={1}
    />
  ) : (
    <circle
      cx={cx}
      cy={cy}
      r={legend ? 6 : kind === 'england' ? 7 : 5}
      fill={fill}
      stroke={kind === 'england' && !legend ? '#fff' : undefined}
      strokeWidth={1}
    />
  );
}

export function AxisTitle({
  label,
  period,
  horizontal,
}: {
  label: string;
  period: string;
  horizontal?: boolean;
}) {
  const lines: string[] = [];
  for (const word of label.split(' ')) {
    const last = lines.at(-1);
    if (last && `${last} ${word}`.length <= (horizontal ? 70 : 60))
      lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  const x = horizontal ? 420 : 20;
  const y = horizontal ? 524 : 72 - lines.length * 18;
  return (
    <text
      className="fphd-chart-axis-title"
      x={x}
      y={y}
      textAnchor={horizontal ? 'middle' : 'start'}
      fill="#0b0c0c"
      fontSize={16}
    >
      {lines.map((line, index) => (
        <tspan key={line} x={x} dy={index ? 18 : 0}>
          {line}
        </tspan>
      ))}
      <tspan x={x} dy={18}>
        {period}
      </tspan>
    </text>
  );
}
