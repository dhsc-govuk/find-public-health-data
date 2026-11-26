"""The service's value type, and its answers about counts and values, for Fingertips' own.

The service holds the value type as a reference to its value_type rows, which are core data in
data/value-types.json, and reads the Fingertips unit as answers about what the values measure or
what a rate is per. A measure or rate object outside the service's lists is "Other", named as
Fingertips names it. tools/data-migration/src/pholio/value-type-and-unit.ts holds the same
translation for the data migration.
"""

import json
from pathlib import Path

CORE_DATA = Path(__file__).resolve().parents[2]


def _ids_by_name(file):
    return {row["name"]: row["id"] for row in json.loads((CORE_DATA / file).read_text())}


VALUE_TYPE_IDS = _ids_by_name("value-types.json")

# Any other Fingertips value type, Excess risk among them, stops the export. A percentage point is
# the gap between two percentages.
VALUE_TYPES = {
    **{name: name for name in VALUE_TYPE_IDS},
    "Slope Index of Inequality": "Slope index of inequality",
    "Relative Index of Inequality": "Relative index of inequality",
    "Number": "Count",
    "Months life lost": "Count",
    "Rate ratio": "Ratio",
    # Pholio's placeholder for the value type the Fingertips API gives id 21, Gap.
    "Unknown value type 21": "Gap",
    "Percentage point": "Gap",
}

# Pholio's placeholders for units the Fingertips API names, each named as Pholio's unit with the
# label and multiplier the API gives its id. Any other placeholder stops the export.
UNIT_PLACEHOLDERS = {
    "Unknown unit 54": "admissions",
    "Unknown unit 56": "£",
    "Unknown unit 57": "per 1,000,000",
    "Unknown unit 58": "Minutes",
    "Unknown unit 59": "per 100,000 bed-days",
    "Unknown unit 60": "per 100",
    "Unknown unit 61": "litres per adult",
    "Unknown unit 63": "µg/m-3 (micrograms per cubic meter)",
    "Unknown unit 65": "per 100 procedures",
    "Unknown unit 66": "Score",
    "Unknown unit 67": "Count",
    "Unknown unit 68": "Percentage points",
    "Unknown unit 71": "per 1,000, per day ",
    "Unknown unit 72": "per 100,000 smoking population aged 18+",
    "Unknown unit 73": "per re-offender",
    "Unknown unit 74": "per 1,000,000,000 vehicle miles",
    "Unknown unit 75": "Persons per km2",
    "Unknown unit 76": "Centimetre",
}



def _measure(measure, detail=None):
    return {"kind": "measure", "measure": measure, "detail": detail}


def _rate(per, rate_object=None, detail=None):
    return {"kind": "rate", "per": per, "object": rate_object, "detail": detail}


_NONE = {"kind": "none"}

# What each Fingertips unit says about the values, by its Pholio name. Any other unit stops the
# export.
UNIT_READINGS = {
    "No unit": _NONE,
    "Count": _NONE,
    "Score": _measure("other", "score"),
    "Percent": {"kind": "percent"},
    "per 100": _rate(100),
    "per 1,000": _rate(1000),
    "per 10,000": _rate(10000),
    "per 100,000": _rate(100000),
    "per 1,000,000": _rate(1000000),
    "per 1,000 bed-days": _rate(1000, "bed-days"),
    "per 10,000 bed-days": _rate(10000, "bed-days"),
    "per 100,000 bed-days": _rate(100000, "bed-days"),
    "per 100,000 smoking population aged 16+": _rate(100000, "smokers-aged-16-plus"),
    "per 100,000 smoking population aged 18+": _rate(100000, "smokers-aged-18-plus"),
    "per STAR-PU": _rate(1, "star-pu"),
    "per re-offender": _rate(1, "re-offender"),
    "per 1,000,000,000 vehicle miles": _rate(1000000000, "vehicle-miles"),
    "per 100 women aged 15-17": _rate(100, "other", "women aged 15-17"),
    "per 1,000 births": _rate(1000, "other", "births"),
    "per 1,000 live births": _rate(1000, "other", "live births"),
    "per 100,000 aged 16+": _rate(100000, "other", "aged 16+"),
    "per 100,000 aged 35+": _rate(100000, "other", "aged 35+"),
    "per 100,000 aged 65+": _rate(100000, "other", "aged 65+"),
    "per 10,000 aged 65+": _rate(10000, "other", "aged 65+"),
    "per 1,000 aged 65+": _rate(1000, "other", "aged 65+"),
    "per 100 procedures": _rate(100, "other", "procedures"),
    "per offender": _rate(1, "other", "offender"),
    "per 1,000, per day": _rate(1000, "other", "per day"),
    "£ per capita": _rate(1, "capita"),
    "Persons per km2": _rate(1, "other", "km2"),
    "£": _measure("pounds"),
    "Minutes": _measure("minutes"),
    "Days": _measure("days"),
    "Years": _measure("years"),
    "admissions": _measure("admissions"),
    "Cases": _measure("cases"),
    "population": _measure("other", "population"),
    "Percentage points": _measure("percentage-points"),
    "discharges": _measure("other", "discharges"),
    "Kg/m2": _measure("other", "kg/m2"),
    "litres per adult": _measure("other", "litres per adult"),
    "µg/m-3 (micrograms per cubic meter)": _measure("other", "µg/m3"),
    "Centimetre": _measure("other", "cm"),
    "Average daily quantity": _measure("other", "average daily quantity"),
    "Number of items prescribed": _measure("other", "items prescribed"),
}

# The Fingertips API gives a unit's label, not its name: each readable unit's name by its label.
# "£" is left out, as Pholio's "£ per 100,000" has that label too.
UNIT_NAMES_BY_LABEL = {
    "%": "Percent",
    "per 100": "per 100",
    "per 1,000": "per 1,000",
    "per 10,000": "per 10,000",
    "per 100,000": "per 100,000",
    "per 1,000,000": "per 1,000,000",
    "min": "Minutes",
    "Days": "Days",
    "Years": "Years",
    "No unit": "No unit",
}

COUNTS_AND_VALUES_COLUMNS = [
    "has_count",
    "count_measure",
    "count_measure_detail",
    "count_is_estimate",
    "rate_per",
    "rate_object",
    "rate_object_detail",
    "value_same_as_count",
    "value_measure",
    "value_measure_detail",
    "gap_object",
    "gap_object_detail",
    "ratio_format",
]

# Fingertips indicators whose count is an estimated number of people, as in
# ESTIMATED_COUNT_INDICATOR_IDS in @fphd/utils/value-type-and-unit.
ESTIMATED_COUNT_INDICATOR_IDS = frozenset({92443})

RATE_TYPES = ("Crude rate", "Directly standardised rate", "Indirectly standardised rate")
VALUE_MEASURE_TYPES = (
    "Mean",
    "Median",
    "Gap",
    "Slope index of inequality",
    "Relative index of inequality",
)


def value_type_id(name):
    """The value type for a Fingertips value type name; a name with none stops the export."""
    try:
        return VALUE_TYPE_IDS[VALUE_TYPES[name]]
    except KeyError:
        raise ValueError(f"No value type for the Fingertips value type {name!r}") from None


def unit_reading(name):
    """What a Fingertips unit says, by its Pholio name or placeholder, or None for none known."""
    return UNIT_READINGS.get(UNIT_PLACEHOLDERS.get(name, name).strip(" "))


def _answers(value_type, reading):
    """The answers the value type asks that the unit gives; nothing for a unit they cannot hold."""
    kind = reading["kind"]
    if kind == "none":
        return {}
    if kind == "percent":
        if value_type == "Ratio":
            return {"ratio_format": "percentage"}
        # A rate in percent is a rate per 100.
        return {"rate_per": 100} if value_type in RATE_TYPES else {}
    if kind == "rate":
        if value_type not in RATE_TYPES:
            return {}
        return {
            "rate_per": reading["per"],
            "rate_object": reading["object"],
            "rate_object_detail": reading["detail"],
        }
    if value_type == "Count":
        return {"count_measure": reading["measure"], "count_measure_detail": reading["detail"]}
    if value_type in VALUE_MEASURE_TYPES:
        return {"value_measure": reading["measure"], "value_measure_detail": reading["detail"]}
    return {}


def counts_and_values(value_type_name, unit_name, fingertips_id):
    """The counts and values columns for a Fingertips indicator; a unit it cannot read stops.

    A percentage point measures percentage points whatever its unit. A count's measure says
    whether it is an estimate, as the form does.
    """
    value_type_id(value_type_name)
    reading = unit_reading(unit_name)
    if reading is None:
        raise ValueError(f"No answers for the Fingertips unit {unit_name!r}")
    if value_type_name == "Percentage point":
        answers = {"value_measure": "percentage-points"}
    else:
        answers = _answers(VALUE_TYPES[value_type_name], reading)
    counted = answers.get("count_measure") is not None
    return {
        **{column: None for column in COUNTS_AND_VALUES_COLUMNS},
        **answers,
        "count_is_estimate": (int(fingertips_id) in ESTIMATED_COUNT_INDICATOR_IDS)
        if counted
        else None,
    }


def unit_name_for_label(label):
    """The Fingertips unit name for a Fingertips API unit label; any other label stops the import."""
    try:
        return UNIT_NAMES_BY_LABEL[label]
    except KeyError:
        raise ValueError(f"No Fingertips unit name known for the unit label {label!r}") from None


def unknown_value_types(names):
    """The names among these the translation has no value type for."""
    return sorted(name for name in names if name not in VALUE_TYPES)
