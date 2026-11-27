"""Checks for where the exports put a Fingertips count."""

import csv
import gzip
import runpy
import tempfile
import unittest
from pathlib import Path

from count_and_numerator import count_is_numerator, split_count
from value_type_and_unit import VALUE_TYPE_IDS

split = runpy.run_path(str(Path(__file__).with_name("split-count-and-numerator.py")))


class CountIsNumeratorTest(unittest.TestCase):
    def test_holds_the_count_as_numerator_for_values_calculated_from_one(self):
        self.assertEqual(
            [name for name, value_type_id in VALUE_TYPE_IDS.items() if count_is_numerator(value_type_id, 241)],
            [
                "Crude rate",
                "Directly standardised rate",
                "Indirectly standardised proportion",
                "Indirectly standardised rate",
                "Indirectly standardised ratio",
                "Proportion",
                "Ratio",
            ],
        )

    def test_keeps_the_count_of_a_count(self):
        self.assertFalse(count_is_numerator(VALUE_TYPE_IDS["Count"], 93014))

    def test_keeps_the_count_of_an_indicator_with_no_value_type(self):
        self.assertFalse(count_is_numerator("", 241))

    def test_keeps_the_estimated_count_of_a_survey_proportion(self):
        self.assertFalse(count_is_numerator(VALUE_TYPE_IDS["Proportion"], "92443"))


class SplitCountTest(unittest.TestCase):
    def test_moves_a_proportions_count_to_its_numerator(self):
        row = {"id": "1", "count": "12"}

        self.assertEqual(
            split_count(row, VALUE_TYPE_IDS["Proportion"], 241),
            {"id": "1", "count": "", "numerator": "12"},
        )

    def test_keeps_a_life_expectancys_count(self):
        row = {"id": "1", "count": "12"}

        self.assertEqual(
            split_count(row, VALUE_TYPE_IDS["Life expectancy"], 90366, empty=None),
            {"id": "1", "count": "12", "numerator": None},
        )


def write_csv(path, rows):
    with gzip.open(path, "wt", newline="") as target:
        writer = csv.writer(target)
        writer.writerows(rows)


def read_csv(path):
    with gzip.open(path, "rt", newline="") as source:
        return list(csv.reader(source))


class SplitCountAndNumeratorScriptTest(unittest.TestCase):
    def setUp(self):
        self.directory = Path(tempfile.mkdtemp())
        write_csv(
            self.directory / "indicator.csv.gz",
            [["id", "short_id"], ["rate", "93014"], ["number", "92196"], ["survey", "92443"]],
        )
        write_csv(
            self.directory / "indicator_version.csv.gz",
            [
                ["id", "indicator_id", "value_type_id"],
                ["v1", "rate", VALUE_TYPE_IDS["Crude rate"]],
                ["v2", "number", VALUE_TYPE_IDS["Count"]],
                ["v3", "survey", VALUE_TYPE_IDS["Proportion"]],
            ],
        )

    def test_adds_a_numerator_column_after_count_and_moves_the_rates_counts(self):
        write_csv(
            self.directory / "observation.csv.gz",
            [
                ["id", "indicator_id", "value", "count", "denominator"],
                ["o1", "rate", "2.5", "10", "400"],
                ["o2", "number", "7", "7", ""],
                ["o3", "survey", "13.9", "6144703", ""],
            ],
        )

        split["main"](str(self.directory))

        self.assertEqual(
            read_csv(self.directory / "observation.csv.gz"),
            [
                ["id", "indicator_id", "value", "count", "numerator", "denominator"],
                ["o1", "rate", "2.5", "", "10", "400"],
                ["o2", "number", "7", "7", "", ""],
                ["o3", "survey", "13.9", "6144703", "", ""],
            ],
        )

    def test_refuses_a_file_that_already_has_a_numerator(self):
        write_csv(
            self.directory / "observation.csv.gz",
            [["id", "indicator_id", "count", "numerator"], ["o1", "rate", "", "10"]],
        )

        with self.assertRaises(ValueError) as raised:
            split["main"](str(self.directory))

        self.assertIn("already has a numerator column", str(raised.exception))

    def test_refuses_an_observation_of_no_exported_version(self):
        write_csv(
            self.directory / "observation.csv.gz",
            [["id", "indicator_id", "count"], ["o1", "missing", "10"]],
        )

        with self.assertRaises(ValueError) as raised:
            split["main"](str(self.directory))

        self.assertIn("o1", str(raised.exception))


if __name__ == "__main__":
    unittest.main()
