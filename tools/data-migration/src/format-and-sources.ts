/**
 * What Fingertips holds about one side of an indicator's calculation: its definition and the
 * name of its source, either of which may be missing.
 */
export interface FingertipsSide<Source> {
  definition: string | null;
  source: Source | null;
}

/** The disclosure control answer Fingertips gives for the whole indicator. */
export interface FingertipsDisclosureControl {
  answer: string | null;
  detail: string | null;
}

/** One figure of the service's calculation, with the source Fingertips names for it. */
export interface FigureColumns<Source> {
  definition: string | null;
  disclosureControl: string | null;
  disclosureControlDetail: string | null;
  source: Source | null;
}

/** The service's indicator format and sources for one Fingertips indicator. */
export interface FormatAndSources<Source> {
  hasNumeratorDenominator: boolean | null;
  numerator: FigureColumns<Source> | null;
  denominator: FigureColumns<Source> | null;
  dataValue: FigureColumns<Source> | null;
}

function isPresent<Source>({ definition, source }: FingertipsSide<Source>): boolean {
  return (definition !== null && definition.trim() !== '') || source !== null;
}

/**
 * The same rule the importer applies to a package's versions (see
 * `applyLegacyFormatAndSources` in `@fphd/db-operations`), for a seed written straight to a
 * database. Both sides make a numerator and denominator, with the disclosure control on the
 * numerator and the denominator's unanswered. One side makes a single data value, with the
 * disclosure control. Neither leaves the question unanswered. "No" becomes "not-applicable".
 */
export function formatAndSources<Source>(
  numerator: FingertipsSide<Source>,
  denominator: FingertipsSide<Source>,
  { answer, detail }: FingertipsDisclosureControl,
): FormatAndSources<Source> {
  const disclosureControl = answer === 'no' ? 'not-applicable' : answer;
  const disclosureControlDetail = answer === 'yes' ? detail : null;
  const hasNumerator = isPresent(numerator);
  const hasDenominator = isPresent(denominator);

  if (hasNumerator && hasDenominator) {
    return {
      hasNumeratorDenominator: true,
      numerator: { ...numerator, disclosureControl, disclosureControlDetail },
      denominator: { ...denominator, disclosureControl: null, disclosureControlDetail: null },
      dataValue: null,
    };
  }

  const side = hasNumerator ? numerator : hasDenominator ? denominator : null;

  return {
    hasNumeratorDenominator: side === null ? null : false,
    numerator: null,
    denominator: null,
    dataValue: side === null ? null : { ...side, disclosureControl, disclosureControlDetail },
  };
}
