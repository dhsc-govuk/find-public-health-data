"""Whether a Fingertips count is the service's count or its numerator.

Fingertips holds one Count. For a value calculated from a numerator and a denominator it is the
numerator, and the service stores it there; for any other value type it stays the count. A survey
indicator whose count is an estimated number of people stays the count whatever its value type.
countIsNumerator in @fphd/utils/value-type-and-unit holds the same lists. Migration 0052 applied
them to existing rows, so a change to them needs a data migration of its own.
"""

from value_type_and_unit import VALUE_TYPE_IDS

NUMERATOR_VALUE_TYPES = (
    "Crude rate",
    "Directly standardised rate",
    "Indirectly standardised proportion",
    "Indirectly standardised ratio",
    "Proportion",
    "Ratio",
)

NUMERATOR_VALUE_TYPE_IDS = frozenset(VALUE_TYPE_IDS[name] for name in NUMERATOR_VALUE_TYPES)

ESTIMATED_COUNT_INDICATOR_IDS = frozenset(
    {
        92443,  # Smoking prevalence in adults, from the Annual Population Survey
    }
)


def count_is_numerator(value_type_id, fingertips_id):
    """Whether a Fingertips indicator of this service value type id holds its count as numerator."""
    return (
        value_type_id in NUMERATOR_VALUE_TYPE_IDS
        and int(fingertips_id) not in ESTIMATED_COUNT_INDICATOR_IDS
    )


def split_count(row, value_type_id, fingertips_id, empty=""):
    """The observation row with its Fingertips count in count or numerator, the other empty."""
    count = row["count"]
    if count_is_numerator(value_type_id, fingertips_id):
        return {**row, "count": empty, "numerator": count}
    return {**row, "count": count, "numerator": empty}
