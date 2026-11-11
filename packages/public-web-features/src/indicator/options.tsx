import { Button, Checkboxes, CollapsibleFilterCard, Details, Hint, Radios, Select } from '@fphd/ui';
import { type ReactNode, useId } from 'react';
import { Form, useLocation, useNavigate, useNavigation } from 'react-router';

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
  return (entries: readonly (readonly [string, string, string])[]) => {
    const params = new URLSearchParams(navigation.location?.search ?? location.search);
    for (const [key, value, empty] of entries) {
      if (value === empty) {
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
  benchmark: BenchmarkChoice;
  confidence: ConfidenceLevel;
  periodType: PeriodType;
  /** Whether the benchmark columns include the min/max spread and comparison plot. */
  range: boolean;
  sex: string;
}

type OptionScope = number | 'compare';

function panelOptionNames(scope: OptionScope) {
  return {
    benchmark: `cmp-${scope}`,
    confidence: `ci-${scope}`,
    periodType: `pt-${scope}`,
    range: `cr-${scope}`,
    sex: `sex-${scope}`,
  };
}

export function usePanelOptions(scope: OptionScope) {
  const { search } = useLocation();
  const navigation = useNavigation();
  const params = new URLSearchParams(navigation.location?.search ?? search);
  const names = panelOptionNames(scope);
  const apply = useOptionParamNavigation();
  const benchmark = params.get(names.benchmark);
  const confidence = params.get(names.confidence);
  const periodType = params.get(names.periodType);
  const options: PanelOptions = {
    benchmark: benchmark === 'england' || benchmark === 'region' ? benchmark : 'none',
    confidence: confidence === '95' || confidence === '99.8' ? confidence : 'none',
    periodType: periodType === '1-year' || periodType === '3-year' ? periodType : 'all',
    range: params.get(names.range) === 'yes',
    sex: params.get(names.sex) ?? '',
  };
  const update = (next: PanelOptions) =>
    apply([
      [names.benchmark, next.benchmark, 'none'],
      [names.confidence, next.confidence, 'none'],
      [names.periodType, next.periodType, 'all'],
      [names.range, next.range ? 'yes' : '', ''],
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
  const preserved = [...new URLSearchParams(location.search)].filter(
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

/**
 * "Chart options" / "Table options" disclosure. Every panel offers the confidence-interval
 * choice; the sex and period controls appear only where the indicator reports those segments.
 */
export function PanelOptionsPanel({
  accordion = false,
  columns,
  onColumnsChange,
  benchmarks,
  confidenceLevels,
  label,
  measures = [],
  onChange,
  options,
  periodTypes,
  scope,
  sexes,
  showConfidence,
  target,
}: {
  accordion?: boolean;
  columns?: TrendColumns;
  onColumnsChange?: (columns: TrendColumns) => void;
  /** Which comparisons the shown areas support; absent when only England is shown. */
  benchmarks?: { region: boolean } | undefined;
  confidenceLevels: Exclude<ConfidenceLevel, 'none'>[];
  label: string;
  /** The raw numbers the data has, which the table columns offer. */
  measures?: Measure[];
  onChange: (options: PanelOptions) => void;
  options: PanelOptions;
  periodTypes: PeriodType[];
  scope: OptionScope;
  sexes: string[];
  showConfidence: boolean;
  target: OptionTarget;
}) {
  const ids = {
    benchmark: useId(),
    confidence: useId(),
    period: useId(),
    range: useId(),
    sex: useId(),
  };
  const names = panelOptionNames(scope);
  const rangeOptions = [
    { label: 'Yes', value: 'yes', checked: options.range },
    { label: 'No', value: 'no', checked: !options.range },
  ];
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
      ]
    : [];

  const content = (
    <OptionsForm names={[...Object.values(names), `columns-${scope}`]} target={target}>
      {columns && onColumnsChange ? (
        <>
          <input type="hidden" name={`columns-${scope}`} value="" />
          <Checkboxes
            id={`columns-${scope}`}
            name={`columns-${scope}`}
            classModifiers="small"
            label={<span className="govuk-visually-hidden">Table columns</span>}
            options={columnOptions}
            onChange={(event) => {
              const { value, checked } = event.currentTarget;
              onColumnsChange(
                value === 'count' || value === 'numerator' || value === 'value'
                  ? { ...columns, [value]: checked }
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
      {benchmarks ? (
        <Select
          id={ids.benchmark}
          label="Select a geography or goal to compare with"
          name={names.benchmark}
          onChange={(event) =>
            onChange({ ...options, benchmark: event.currentTarget.value as BenchmarkChoice })
          }
          options={[
            { label: 'None', value: 'none' },
            { label: 'England', value: 'england' },
            ...(benchmarks.region ? [{ label: 'Statistical regions', value: 'region' }] : []),
          ]}
          value={options.benchmark}
        />
      ) : null}
      {benchmarks && options.benchmark !== 'none' ? (
        <Radios
          classModifiers="inline"
          id={ids.range}
          label="Show comparison range"
          name={names.range}
          onChange={(event) => onChange({ ...options, range: event.currentTarget.value === 'yes' })}
          options={rangeOptions}
        />
      ) : null}
      <div className="fphd-segmentation-options__selects">
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

        {periodTypes.length > 1 ? (
          <Select
            id={ids.period}
            label="Select time period type"
            name={names.periodType}
            onChange={(event) =>
              onChange({ ...options, periodType: event.currentTarget.value as PeriodType })
            }
            options={['all' as const, ...periodTypes].map((value) => ({
              label: periodTypeLabel(value),
              value,
            }))}
            value={options.periodType}
          />
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
    <OptionsForm names={Object.values(names)} target={target}>
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
