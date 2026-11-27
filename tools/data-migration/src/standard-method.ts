import { standardCalculationMethodOf } from '@fphd/utils/standard-methods';

/**
 * The answer to "Was the standard calculation method used for this indicator?" for a Fingertips
 * indicator. Fingertips holds each indicator's own methodology and never says that the standard
 * method of its value type was followed, so an indicator with a methodology keeps it under No. A
 * value type with no standard method, such as Score, is not asked the question, and an indicator
 * with no methodology leaves it unanswered. The seed export's `standard_method.py` holds the same
 * rule.
 */
export function standardMethodUsed(
  valueTypeId: string | null,
  methodology: string | null,
): false | null {
  if (valueTypeId === null || methodology === null || methodology === '') return null;
  return standardCalculationMethodOf(valueTypeId) === null ? null : false;
}
