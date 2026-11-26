/**
 * What Fingertips holds about one side of an indicator's calculation: its definition and the
 * name of its source, either of which may be missing.
 */
export interface FingertipsSide {
  definition: string | null;
  source: string | null;
}

/** The disclosure control answer Fingertips gives for the whole indicator. */
export interface FingertipsDisclosureControl {
  answer: string | null;
  detail: string | null;
}

/** One figure of the service's calculation, with the source Fingertips names for it. */
export interface FigureColumns {
  definition: string | null;
  disclosureControl: string | null;
  disclosureControlDetail: string | null;
  source: string | null;
}

/** The service's indicator format and sources for one Fingertips indicator. */
export interface FormatAndSources {
  hasNumeratorDenominator: boolean | null;
  numerator: FigureColumns | null;
  denominator: FigureColumns | null;
  dataValue: FigureColumns | null;
}

function isBlank(text: string | null): boolean {
  return text === null || text.trim() === '';
}

/** A side with a definition or a source; a blank name, which names no source, is none. */
function isPresent({ definition, source }: FingertipsSide): boolean {
  return !isBlank(definition) || !isBlank(source);
}

/**
 * The same rule the importer applies to a package's versions (see
 * `applyLegacyFormatAndSources` in `@fphd/db-operations`), for a seed written straight to a
 * database. Both sides make a numerator and denominator, with the disclosure control on the
 * numerator and the denominator's unanswered. One side makes a single data value, with the
 * disclosure control. Neither leaves the question unanswered. "No" becomes "not-applicable".
 */
export function formatAndSources(
  numerator: FingertipsSide,
  denominator: FingertipsSide,
  { answer, detail }: FingertipsDisclosureControl,
): FormatAndSources {
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
