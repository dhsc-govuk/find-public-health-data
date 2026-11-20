import { Details } from '@fphd/ui';

const colours = [
  ['#8ed973', 'Better'],
  ['#ffc000', 'Similar'],
  ['#c00000', 'Worse'],
  ['#bed2ff', 'Lower (no better or worse)'],
  ['#5555e6', 'Higher (no better or worse)'],
  ['#6f7276', 'No comparison available'],
] as const;

export function SpineChartKey() {
  return (
    <Details summary="Key to the comparison chart">
      <p className="govuk-body-s govuk-!-font-weight-bold govuk-!-margin-bottom-2">Chart</p>
      <svg
        width="480"
        height="140"
        viewBox="0 0 480 140"
        className="fphd-range-key-example"
        role="img"
        aria-label="Example comparison chart. The dashed box runs from the lowest to the highest value. The shaded band runs from the 25th to the 75th percentile. The black line in the middle marks the benchmark and the dot shows the area value."
      >
        <rect
          x="40"
          y="44"
          width="400"
          height="36"
          fill="none"
          stroke="#6f7276"
          strokeWidth="2"
          strokeDasharray="4 4"
        />
        <rect x="150" y="44" width="180" height="36" fill="#6f7276" fillOpacity="0.1" />
        <path d="M150 44v36 M330 44v36" stroke="#6f7276" strokeWidth="1.5" />
        <circle cx="290" cy="62" r="12" fill="#6f7276" />
        <path d="M240 40v44" stroke="#ffffff" strokeWidth="6" />
        <path d="M240 40v44" stroke="#0b0c0c" strokeWidth="3" />
        <path
          d="M290 28v21 M150 81v13 M330 81v13 M40 81v39 M240 85v35 M440 81v39"
          stroke="#0b0c0c"
        />
        <g fill="#0b0c0c" fontSize="14" textAnchor="middle">
          <text x="290" y="22">
            Area value
          </text>
          <text x="150" y="108">
            25th percentile
          </text>
          <text x="330" y="108">
            75th percentile
          </text>
          <text x="40" y="134" textAnchor="start">
            Lowest
          </text>
          <text x="240" y="134">
            Benchmark
          </text>
          <text x="440" y="134" textAnchor="end">
            Highest
          </text>
        </g>
      </svg>
      <p className="govuk-body-s">
        Lowest and highest are of all areas of the same type. The shaded band is the middle half of
        those areas.
      </p>
      <p className="govuk-body-s govuk-!-font-weight-bold govuk-!-margin-bottom-2">Dot colour</p>
      <ul className="govuk-list govuk-body-s fphd-range-key">
        {colours.map(([fill, label]) => (
          <li key={label}>
            <svg aria-hidden="true" width="40" height="24">
              <circle cx="20" cy="12" r="10" fill={fill} />
            </svg>
            {label}
          </li>
        ))}
      </ul>
    </Details>
  );
}
