"""The service's answer to "Was the standard calculation method used for this indicator?".

Fingertips holds each indicator's own methodology and never says that the standard method of its
value type was followed, so an indicator with a methodology keeps it under the answer No. A value
type with no standard method, which @fphd/utils/standard-methods lists with a null description,
is not asked the question, and an indicator with no methodology leaves it unanswered.
tools/data-migration/src/standard-method.ts holds the same rule for the data migration.
"""

from value_type_and_unit import VALUE_TYPE_IDS

NO_STANDARD_METHOD_VALUE_TYPE_IDS = {VALUE_TYPE_IDS["Score"]}


def standard_method_used(value_type_id, methodology):
    """False for a methodology the question asks about, otherwise None (unanswered)."""
    if not methodology or not value_type_id:
        return None
    if value_type_id in NO_STANDARD_METHOD_VALUE_TYPE_IDS:
        return None
    return False
