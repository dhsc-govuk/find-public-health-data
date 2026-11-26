/** A Fingertips confidence interval method, as Pholio's `L_CIMethods` holds it. */
export interface PholioCiMethod {
  id: number;
  name: string;
}

/** A version's confidence interval answers, with the method under its Pholio id. */
export interface CiMethodAnswers {
  ci_method_id: number | null;
  has_ci_method_modifications: boolean | null;
  ci_method_modifications_detail: string | null;
}

/** Fingertips' variant of Byar's method, which the service records as a modification of it. */
const BYARS_WITHOUT_CORRECTION = "Byar's method (no small number correction)";

const BYARS = "Byar's method";

/** Fingertips' method for an indicator whose method it did not know, which the service leaves unanswered. */
const UNKNOWN = 'Unknown';

const UNANSWERED: CiMethodAnswers = {
  ci_method_id: null,
  has_ci_method_modifications: null,
  ci_method_modifications_detail: null,
};

/**
 * The answers a version gets for its Fingertips method. An unknown method leaves the question
 * unanswered. Byar's method with no small number correction becomes Byar's method, modified. Any
 * other method keeps its id, and the modifications question stays unanswered.
 */
export function ciMethodAnswers(
  ciMethodId: number | null,
  methods: readonly PholioCiMethod[],
): CiMethodAnswers {
  if (ciMethodId === null) return UNANSWERED;

  const name = methods.find(({ id }) => id === ciMethodId)?.name;

  if (name === UNKNOWN) return UNANSWERED;

  if (name === BYARS_WITHOUT_CORRECTION) {
    const byars = methods.find((method) => method.name === BYARS);
    if (byars === undefined) throw new Error(`Pholio lists no ${BYARS} for ${name}`);

    return {
      ci_method_id: byars.id,
      has_ci_method_modifications: true,
      ci_method_modifications_detail: 'No small number correction',
    };
  }

  return { ...UNANSWERED, ci_method_id: ciMethodId };
}
