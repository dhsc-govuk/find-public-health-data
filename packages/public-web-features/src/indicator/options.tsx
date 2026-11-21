import { Button, Checkboxes, CollapsibleFilterCard, Details, Hint, Radios, Select } from '@fphd/ui';
import { isObservationPeriodType } from '@fphd/utils/observation-series';
import { type ReactNode, useId } from 'react';
import { Form, useLocation, useNavigate, useNavigation } from 'react-router';

import {
  type BenchmarkOption,
  benchmarkCheckboxOptions,
  canonicalBenchmarks,
  selectedBenchmarks,
} from './benchmarks.ts';
import { quintileParam } from './charts/chart-data.ts';
import type { BenchmarkChoice } from './comparison.ts';
import {
  type ConfidenceLevel,
  inequalityCategoryHint,
  inequalityCategoryOptions,
  MEASURES,
  type Measure,
  type PeriodType,
  periodTypeLabel,
} from './data.ts';
import type { TrendColumns } from './trend.ts';

function currentOptionParams(search: string) {
  const params = new URLSearchParams(search);
  for (const name of [...params.keys()]) {
    if (/^cr-(?:\d+|compare)$/.test(name)) params.delete(name);
  }
  return params;
}

/** The confidence-interval choices, narrowed to what the indicator publishes. */
export function confidenceOptions(levels: string[]) {
  return [
    { label: 'None', value: 'none' },
    ...(levels.includes('95') ? [{ label: '95%', value: '95' }] : []),
    ...(levels.includes('99.8') ? [{ label: '99.8%', value: '99.8' }] : []),
  ];
}

/** Writes [key, value, default] option triples to the query string in place: router
 *  navigation with replace + preventScrollReset, skipped by the route's revalidation. */
export function useOptionParamNavigation() {
  const location = useLocation();
  const navigation = useNavigation();
  const navigate = useNavigate();
  return (entries: readonly (readonly [string, string | readonly string[], string])[]) => {
    const params = currentOptionParams(navigation.location?.search ?? location.search);
    for (const [key, value, empty] of entries) {
      if (typeof value !== 'string') {
        params.delete(key);
        for (const entry of value.length ? value : ['']) params.append(key, entry);
      } else if (value === empty) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    void navigate(
      { search: `?${params.toString()}` },
      { replace: true, preventScrollReset: true, flushSync: true },
    );
  };
}

export interface PanelOptions {
  benchmarks: BenchmarkChoice[];
  confidence: ConfidenceLevel;
  periodType: PeriodType;
  sex: string;
}

type OptionScope = number | 'compare';

export interface PeriodSelect {
  options: PeriodType[];
  value: PeriodType;
  notice?: string | null;
}

function panelOptionNames(scope: OptionScope) {
  return {
    benchmark: `cmp-${scope}`,
    confidence: `ci-${scope}`,
    periodType: `pt-${scope}`,
    sex: `sex-${scope}`,
  };
}

export function usePanelOptions(scope: OptionScope) {
  const { search } = useLocation();
  const navigation = useNavigation();
  const params = new URLSearchParams(navigation.location?.search ?? search);
  const names = panelOptionNames(scope);
  const apply = useOptionParamNavigation();
  const confidence = params.get(names.confidence);
  const periodType = params.get(names.periodType);
  const options: PanelOptions = {
    benchmarks: selectedBenchmarks(params, scope),
    confidence: confidence === '95' || confidence === '99.8' ? confidence : 'none',
    periodType: isObservationPeriodType(periodType) ? periodType : 'all',
    sex: params.get(names.sex) ?? '',
  };
  const update = (next: PanelOptions) =>
    apply([
      ...(next.benchmarks.join() === options.benchmarks.join()
        ? []
        : ([[names.benchmark, canonicalBenchmarks(next.benchmarks), 'none']] as const)),
      [names.confidence, next.confidence, 'none'],
      [names.periodType, next.periodType, 'all'],
      [names.sex, next.sex, ''],
    ]);
  return [options, update] as const;
}

interface OptionTarget {
  tabParam: string;
  tabValue: string;
  anchor: string;
}

function OptionsForm({
  children,
  names,
  target,
}: {
  children: ReactNode;
  names: string[];
  target: OptionTarget;
}) {
  const location = useLocation();
  const preserved = [...currentOptionParams(location.search)].filter(
    ([name]) => name !== target.tabParam && !names.includes(name),
  );
  return (
    <Form action={`${location.pathname}#${target.anchor}`} method="get" replace preventScrollReset>
      {preserved.map(([name, value], index) => (
        <input key={`${name}-${index}`} name={name} type="hidden" value={value} />
      ))}
      <input name={target.tabParam} type="hidden" value={target.tabValue} />
      {children}
      <noscript>
        <Button className="govuk-!-margin-bottom-0" type="submit">
          Apply options
        </Button>
      </noscript>
    </Form>
  );
}

export function BenchmarksPanel({
  choices,
  onChange,
  region,
  availableOptions = benchmarkCheckboxOptions(region),
  scope,
  target,
}: {
  choices: readonly BenchmarkChoice[];
  onChange: (choices: BenchmarkChoice[]) => void;
  region: boolean;
  availableOptions?: BenchmarkOption[];
  scope: number;
  target: OptionTarget;
}) {
  const id = `benchmark-${useId()}`;
  const name = `cmp-${scope}`;
  return (
    <CollapsibleFilterCard active={false} defaultOpenOnDesktop title="Benchmarks">
      <OptionsForm names={[name]} target={target}>
        <input type="hidden" name={name} value="" />
        {/* The shared container hides the legend text but leaves the legend's spacing. */}
        <fieldset className="govuk-fieldset" aria-describedby={`${id}-hint`}>
          <legend className="govuk-fieldset__legend govuk-visually-hidden">Benchmarks</legend>
          <Hint id={`${id}-hint`}>
            Compare with geographies, deprivation levels or policy goals (where available).
          </Hint>
          <div className="govuk-checkboxes govuk-checkboxes--small" data-module="govuk-checkboxes">
            {availableOptions.map(({ value, label }) => (
              <Checkboxes.Item
                key={value}
                id={`${id}-${value}`}
                name={name}
                value={value}
                label={label}
                checked={choices.includes(value)}
                onChange={(event) =>
                  onChange(
                    canonicalBenchmarks(
                      event.currentTarget.checked
                        ? [...choices, value]
                        : choices.filter((choice) => choice !== value),
                    ),
                  )
                }
              />
            ))}
          </div>
        </fieldset>
      </OptionsForm>
    </CollapsibleFilterCard>
  );
}

/**
 * "Chart options" / "Table options" disclosure. Every panel offers the confidence-interval
 * choice; the sex and period controls appear only where the indicator reports those segments.
 */
export function PanelOptionsPanel({
  accordion = false,
  columns,
  onColumnsChange,
  rangeBenchmarks = false,
  policyGoal = false,
  goalRadios = false,
  confidenceLevels,
  label,
  measures = [],
  onChange,
  options,
  panel = 'table',
  colourByQuintile = false,
  period,
  scope,
  sexes,
  showConfidence,
  target,
}: {
  accordion?: boolean;
  columns?: TrendColumns;
  onColumnsChange?: (columns: TrendColumns) => void;
  rangeBenchmarks?: boolean;
  policyGoal?: boolean;
  goalRadios?: boolean;
  confidenceLevels: Exclude<ConfidenceLevel, 'none'>[];
  label: string;
  /** The raw numbers the data has, which the table columns offer. */
  measures?: Measure[];
  onChange: (options: PanelOptions) => void;
  options: PanelOptions;
  panel?: 'table' | 'chart' | 'compare-areas';
  colourByQuintile?: boolean;
  /** The period type select: its options, the value shown and why that value was chosen. */
  period?: PeriodSelect | undefined;
  scope: OptionScope;
  sexes: string[];
  showConfidence: boolean;
  target: OptionTarget;
}) {
  const ids = {
    confidence: useId(),
    period: useId(),
    sex: useId(),
    colour: useId(),
    goal: useId(),
  };
  const apply = useOptionParamNavigation();
  const colourParam = quintileParam(scope);
  const names = panelOptionNames(scope);
  // The spread and chart columns describe a benchmark, so they are offered only with one.
  const rangeColumns = columns
    ? [
        { value: 'minmax', label: 'Minimum/Maximum values', checked: columns.minMax },
        { value: 'percentiles', label: '25th/75th percentiles', checked: columns.percentiles },
        { value: 'chart', label: 'Comparison chart', checked: columns.chart },
      ]
    : [];
  const offerRange = rangeBenchmarks;
  const columnOptions = columns
    ? [
        ...MEASURES.filter(({ key }) => measures.includes(key)).map(({ key, label }) => ({
          value: key,
          label,
          checked: columns[key],
        })),
        { value: 'value', label: 'Calculated value', checked: columns.value },
        ...confidenceLevels.map((value) => ({
          value,
          label: `${value}% confidence intervals`,
          checked: columns.confidence.includes(value),
        })),
        ...(offerRange ? rangeColumns : []),
        ...(policyGoal
          ? [{ value: 'goal', label: 'Compared with policy goal', checked: columns.goal ?? true }]
          : []),
      ]
    : [];

  const content = (
    <OptionsForm
      names={[
        ...Object.values(names).filter(
          (name) =>
            name !== names.benchmark &&
            (name !== names.sex || sexes.length > (accordion ? 1 : 0)) &&
            (name !== names.periodType || period) &&
            (name !== names.confidence ||
              (!columns && showConfidence && confidenceLevels.length > 0)),
        ),
        ...(columns ? [`columns-${scope}`] : []),
        ...(goalRadios ? [names.benchmark] : []),
        ...(panel === 'compare-areas' ? [colourParam] : []),
      ]}
      target={target}
    >
      {columns && onColumnsChange ? (
        <>
          <input type="hidden" name={`columns-${scope}`} value="" />
          {!policyGoal && (columns.goal ?? true) ? (
            <input type="hidden" name={`columns-${scope}`} value="goal" />
          ) : null}
          {/* Without JavaScript the form drops unoffered columns, so their choices ride along. */}
          {offerRange
            ? null
            : rangeColumns
                .filter(({ checked }) => checked)
                .map(({ value }) => (
                  <input key={value} type="hidden" name={`columns-${scope}`} value={value} />
                ))}
          <Checkboxes
            id={`columns-${scope}`}
            name={`columns-${scope}`}
            classModifiers="small"
            label={<span className="govuk-visually-hidden">Table columns</span>}
            options={columnOptions}
            onChange={(event) => {
              const { value, checked } = event.currentTarget;
              const toggles = {
                count: 'count',
                value: 'value',
                minmax: 'minMax',
                percentiles: 'percentiles',
                chart: 'chart',
                goal: 'goal',
              } as const;
              onColumnsChange(
                value in toggles
                  ? { ...columns, [toggles[value as keyof typeof toggles]]: checked }
                  : {
                      ...columns,
                      confidence: (['95', '99.8'] as const).filter((level) =>
                        level === value ? checked : columns.confidence.includes(level),
                      ),
                    },
              );
            }}
          />
        </>
      ) : null}
      {goalRadios ? (
        <fieldset className="govuk-fieldset">
          <legend className="govuk-fieldset__legend govuk-fieldset__legend--s">Policy goal</legend>
          <div
            className="govuk-radios govuk-radios--inline govuk-radios--small"
            data-module="govuk-radios"
          >
            {[
              { value: 'goal', label: 'Yes' },
              { value: '', label: 'No' },
            ].map(({ value, label }) => (
              <div key={label} className="govuk-radios__item">
                <input
                  className="govuk-radios__input"
                  id={`${ids.goal}-${label}`}
                  type="radio"
                  name={names.benchmark}
                  value={value}
                  checked={options.benchmarks.includes('goal') === (value === 'goal')}
                  onChange={() =>
                    onChange({ ...options, benchmarks: value === 'goal' ? ['goal'] : [] })
                  }
                />
                <label className="govuk-label govuk-radios__label" htmlFor={`${ids.goal}-${label}`}>
                  {label}
                </label>
              </div>
            ))}
          </div>
        </fieldset>
      ) : null}
      <div className="fphd-segmentation-options__selects">
        {panel === 'compare-areas' ? (
          <Select
            id={ids.colour}
            label="Colour areas by"
            name={colourParam}
            onChange={(event) => apply([[colourParam, event.currentTarget.value, '']])}
            options={[
              { label: 'Comparison with England', value: '' },
              { label: '5 equal groups (quintiles)', value: 'yes' },
            ]}
            value={colourByQuintile ? 'yes' : ''}
          />
        ) : null}
        {sexes.length > (accordion ? 1 : 0) ? (
          <Select
            id={ids.sex}
            label="Select sex"
            name={names.sex}
            onChange={(event) => onChange({ ...options, sex: event.currentTarget.value })}
            options={[
              { label: 'All', value: '' },
              ...sexes.map((value) => ({ label: value, value })),
            ]}
            value={options.sex}
          />
        ) : null}

        {period ? (
          <>
            <Select
              id={ids.period}
              label="Type of time period"
              name={names.periodType}
              onChange={(event) =>
                onChange({ ...options, periodType: event.currentTarget.value as PeriodType })
              }
              options={period.options.map((value) => ({
                label: periodTypeLabel(value),
                value,
              }))}
              value={period.value}
            />
            {/* Only the chart's copy announces a change, so a screen reader hears it once. */}
            {accordion ? (
              period.notice ? (
                <p className="govuk-hint">{period.notice}</p>
              ) : null
            ) : (
              <p className={period.notice ? 'govuk-hint' : undefined} role="status">
                {period.notice}
              </p>
            )}
          </>
        ) : null}

        {!columns && showConfidence && confidenceLevels.length > 0 ? (
          <Select
            id={ids.confidence}
            label="Select confidence intervals"
            name={names.confidence}
            onChange={(event) =>
              onChange({ ...options, confidence: event.currentTarget.value as ConfidenceLevel })
            }
            options={confidenceOptions(confidenceLevels)}
            value={options.confidence}
          />
        ) : null}
      </div>
    </OptionsForm>
  );
  return accordion ? (
    <CollapsibleFilterCard active={false} headingLevel={3} title={label}>
      {content}
    </CollapsibleFilterCard>
  ) : (
    <Details summary={label} open>
      {content}
    </Details>
  );
}

/** Inequalities "Options" disclosure: category, period and intervals. */
export function InequalityOptions({
  accordion = false,
  categories,
  category,
  confidence,
  confidenceLevels,
  onCategoryChange,
  onConfidenceChange,
  onPeriodChange,
  period,
  periods,
  scope,
  target,
}: {
  accordion?: boolean;
  categories: string[];
  category: string;
  confidence: ConfidenceLevel;
  confidenceLevels: Exclude<ConfidenceLevel, 'none'>[];
  onCategoryChange: (value: string) => void;
  onConfidenceChange: (value: ConfidenceLevel) => void;
  onPeriodChange: (value: string) => void;
  period: string;
  periods: { value: string; label: string }[];
  scope: number;
  target: OptionTarget;
}) {
  const categoryId = useId();
  const periodId = useId();
  const confidenceId = useId();
  const names = {
    category: `ic-${scope}`,
    period: `ip-${scope}`,
    confidence: `ci-${scope}`,
  };

  const content = (
    <OptionsForm
      names={Object.values(names).filter(
        (name) => name !== names.confidence || (!accordion && confidenceLevels.length > 0),
      )}
      target={target}
    >
      <div className="fphd-segmentation-options__selects">
        {accordion ? (
          <Radios
            classModifiers="small"
            id={categoryId}
            label="Inequality"
            name={names.category}
            options={inequalityCategoryOptions(categories).map(({ value, label }) => ({
              value,
              label,
              checked: value === category,
            }))}
            onChange={(event) => onCategoryChange(event.currentTarget.value)}
          />
        ) : (
          <Select
            id={categoryId}
            label="Select inequality category"
            name={names.category}
            onChange={(event) => onCategoryChange(event.currentTarget.value)}
            options={inequalityCategoryOptions(categories)}
            value={category}
          />
        )}
        {accordion && inequalityCategoryHint(category) ? (
          <Hint>{inequalityCategoryHint(category)}</Hint>
        ) : null}
        <Select
          id={periodId}
          label={accordion ? 'Time period' : 'Select time period'}
          name={names.period}
          onChange={(event) => onPeriodChange(event.currentTarget.value)}
          options={accordion ? periods.toReversed() : periods}
          value={period}
        />
        {!accordion && confidenceLevels.length > 0 ? (
          <Select
            id={confidenceId}
            label="Select confidence intervals"
            name={names.confidence}
            onChange={(event) => onConfidenceChange(event.currentTarget.value as ConfidenceLevel)}
            options={confidenceOptions(confidenceLevels)}
            value={confidence}
          />
        ) : null}
      </div>
    </OptionsForm>
  );
  return accordion ? (
    <CollapsibleFilterCard active headingLevel={3} title="Chart options">
      {content}
    </CollapsibleFilterCard>
  ) : (
    <Details summary="Options" open>
      {content}
    </Details>
  );
}
