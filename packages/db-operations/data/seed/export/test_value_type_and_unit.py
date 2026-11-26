"""Checks for the value type and counts and values translation the exports apply."""

import json
import runpy
import unittest
from pathlib import Path

from value_type_and_unit import (
    COUNTS_AND_VALUES_COLUMNS,
    UNIT_NAMES_BY_LABEL,
    UNIT_PLACEHOLDERS,
    VALUE_TYPE_IDS,
    counts_and_values,
    unit_name_for_label,
    unit_reading,
    unknown_value_types,
    value_type_id,
)

transform = runpy.run_path(str(Path(__file__).with_name("transform-uuids.py")))
reshape = runpy.run_path(str(Path(__file__).with_name("reshape-indicator-versions.py")))
# Every value type and unit row in Pholio.
PHOLIO = json.loads(
    Path(__file__).parents[3].joinpath("src/pholio-value-types-and-units.json").read_text()
)
CORE_VALUE_TYPES = json.loads(Path(__file__).parents[2].joinpath("value-types.json").read_text())

# The Pholio units the exports cannot read, which stop them beside any value type.
UNREADABLE_UNITS = [
    "1,000",
    "average daily quantity per STAR-PU",
    "mean dmft per child",
    "tonnes CO2e per 1000 population",
    "£ per 100,000",
    "£1,000,000 per 100,000",
]

UNANSWERED = {column: None for column in COUNTS_AND_VALUES_COLUMNS}


class ValueTypeIdTest(unittest.TestCase):
    def test_keeps_each_service_value_type(self):
        for row in CORE_VALUE_TYPES:
            with self.subTest(name=row["name"]):
                self.assertEqual(value_type_id(row["name"]), row["id"])

    def test_translates_a_placeholder_as_the_value_type_the_fingertips_api_names(self):
        self.assertEqual(value_type_id("Unknown value type 21"), VALUE_TYPE_IDS["Gap"])

    def test_translates_a_percentage_point_as_a_gap(self):
        self.assertEqual(value_type_id("Percentage point"), VALUE_TYPE_IDS["Gap"])

    def test_refuses_a_value_type_the_service_does_not_have(self):
        for name in ["Excess risk", "Unknown value type 22", "Weighted mean"]:
            with self.assertRaises(ValueError) as raised:
                value_type_id(name)

            self.assertIn(name, str(raised.exception))

    def test_translates_every_pholio_value_type_but_excess_risk(self):
        self.assertEqual(
            unknown_value_types(row["name"] for row in PHOLIO["valueTypes"]), ["Excess risk"]
        )


class UnitReadingTest(unittest.TestCase):
    def test_reads_every_pholio_unit_but_those_listed_as_unreadable(self):
        self.assertEqual(
            sorted(row["name"] for row in PHOLIO["units"] if unit_reading(row["name"]) is None),
            sorted(UNREADABLE_UNITS),
        )

    def test_reads_a_placeholder_as_the_unit_the_fingertips_api_names(self):
        self.assertEqual(len(UNIT_PLACEHOLDERS), 18)
        self.assertEqual(unit_reading("Unknown unit 56"), unit_reading("£"))
        self.assertEqual(unit_reading("Unknown unit 71"), unit_reading("per 1,000, per day"))


class CountsAndValuesTest(unittest.TestCase):
    def test_reads_the_unit_beside_its_value_type(self):
        cases = [
            ("Directly standardised rate", "per 100,000", {"rate_per": 100000}),
            (
                "Crude rate",
                "per 1,000 live births",
                {"rate_per": 1000, "rate_object": "other", "rate_object_detail": "live births"},
            ),
            ("Crude rate", "Percent", {"rate_per": 100}),
            ("Crude rate", "£ per capita", {"rate_per": 1, "rate_object": "capita"}),
            ("Proportion", "Percent", {}),
            ("Number", "£", {"count_measure": "pounds", "count_is_estimate": False}),
            ("Mean", "Kg/m2", {"value_measure": "other", "value_measure_detail": "kg/m2"}),
            ("Mean", "Score", {"value_measure": "other", "value_measure_detail": "score"}),
            ("Ratio", "Percent", {"ratio_format": "percentage"}),
            ("Ratio", "No unit", {}),
            ("Life expectancy", "Years", {}),
            ("Percentage point", "Percent", {"value_measure": "percentage-points"}),
        ]
        for value_type, unit, answers in cases:
            with self.subTest(value_type=value_type, unit=unit):
                self.assertEqual(
                    counts_and_values(value_type, unit, 108), {**UNANSWERED, **answers}
                )

    def test_leaves_unanswered_a_unit_its_value_type_cannot_hold(self):
        for value_type, unit in [
            ("Crude rate", "£"),
            ("Indirectly standardised ratio", "per 100"),
            ("Count", "per 100,000"),
        ]:
            with self.subTest(value_type=value_type, unit=unit):
                self.assertEqual(counts_and_values(value_type, unit, 108), UNANSWERED)

    def test_records_a_surveys_estimated_count_once_its_count_measure_is_answered(self):
        self.assertEqual(counts_and_values("Proportion", "Percent", 92443), UNANSWERED)
        self.assertTrue(counts_and_values("Number", "population", 92443)["count_is_estimate"])

    def test_refuses_a_unit_it_cannot_read(self):
        with self.assertRaises(ValueError):
            counts_and_values("Mean", "£ per 100,000", 108)


class UnitNameForLabelTest(unittest.TestCase):
    def test_gives_the_name_the_exports_translate(self):
        self.assertEqual(unit_name_for_label("%"), "Percent")
        self.assertEqual(unit_name_for_label("min"), "Minutes")
        self.assertEqual(unit_name_for_label("per 100,000"), "per 100,000")

    def test_names_only_readable_units(self):
        for name in UNIT_NAMES_BY_LABEL.values():
            self.assertIsNotNone(unit_reading(name))

    def test_refuses_a_label_it_cannot_name(self):
        # "£" is also the label of "£ per 100,000"; "per 1,000/day" names "per 1,000, per day ".
        for label in ["£", "per 1,000/day", "kg/m2", "Unknown"]:
            with self.assertRaises(ValueError) as raised:
                unit_name_for_label(label)

            self.assertIn(label, str(raised.exception))


class ReshapeTest(unittest.TestCase):
    def test_translates_a_pholio_row_to_the_version_columns(self):
        self.assertEqual(
            reshape["translated_value_type_and_unit"](
                {"value_type_id": "v", "unit_id": "u"},
                {"v": "Directly standardised rate"},
                {"u": "per 1,000 live births"},
                "108",
            ),
            {
                **{column: "" for column in COUNTS_AND_VALUES_COLUMNS},
                "value_type_id": VALUE_TYPE_IDS["Directly standardised rate"],
                "rate_per": "1000",
                "rate_object": "other",
                "rate_object_detail": "live births",
            },
        )


class PublishedTablesTest(unittest.TestCase):
    def test_exports_no_value_type_or_unit_table(self):
        for table in ["value_type", "unit"]:
            self.assertNotIn(table, transform["PUBLISHED_TABLES"])
            self.assertNotIn(f"{table}_id", transform["FOREIGN_KEYS"]["indicator_version"])


if __name__ == "__main__":
    unittest.main()
