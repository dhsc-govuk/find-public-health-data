"""Checks for the year type translation the exports apply."""

import re
import runpy
import unittest
from pathlib import Path

from year_type import (
    ROLLING_FREQUENCY_VALUES,
    TIME_PERIOD_VALUES,
    YEAR_TYPE_COLUMNS,
    YEAR_TYPE_VALUES,
    YEAR_TYPES,
    year_type_values,
)

transform = runpy.run_path(str(Path(__file__).with_name("transform-uuids.py")))
reshape = runpy.run_path(str(Path(__file__).with_name("reshape-indicator-versions.py")))
UTILS = Path(__file__).parents[4] / "utils" / "src" / "period-type.ts"
TYPESCRIPT = Path(__file__).parents[5] / "tools" / "data-migration" / "src" / "pholio" / "year-type.ts"


class YearTypeValuesTest(unittest.TestCase):
    def test_gives_every_fingertips_year_type_a_service_value(self):
        self.assertEqual(len(YEAR_TYPES), 17)
        for name in YEAR_TYPES:
            values = year_type_values(name)
            self.assertEqual(list(values), YEAR_TYPE_COLUMNS)
            for period in values["time_periods"]:
                self.assertIn(period, TIME_PERIOD_VALUES)
            self.assertIn(values["year_type"], [*YEAR_TYPE_VALUES, None])
            self.assertIn(values["rolling_frequency"], [*ROLLING_FREQUENCY_VALUES, None])

    def test_keeps_the_three_in_use_in_the_seed_as_single_years(self):
        for name, year_type in [
            ("Calendar", "calendar"),
            ("Financial", "financial"),
            ("Academic", "academic"),
        ]:
            values = year_type_values(name)
            self.assertEqual(values["time_periods"], ["single-years"])
            self.assertEqual(values["year_type"], year_type)
            self.assertIsNone(values["year_end_day"])
            self.assertFalse(values["periods_rolling"])
            self.assertFalse(values["values_cumulative"])

    def test_gives_a_month_range_the_date_its_year_ends(self):
        values = year_type_values("August-July")

        self.assertEqual(values["year_type"], "specified-end-date")
        self.assertEqual((values["year_end_day"], values["year_end_month"]), (31, 7))

    def test_reads_part_of_a_year_as_a_date_range(self):
        values = year_type_values("September-January")

        self.assertEqual(values["time_periods"], ["date-range"])
        self.assertIsNone(values["year_type"])
        self.assertEqual(
            [
                values["date_range_start_day"],
                values["date_range_start_month"],
                values["date_range_end_day"],
                values["date_range_end_month"],
            ],
            [1, 9, 31, 1],
        )

    def test_rolls_a_rolling_year_on_by_its_frequency(self):
        values = year_type_values("Calendar rolling year - quarterly")

        self.assertEqual(values["year_type"], "calendar")
        self.assertTrue(values["periods_rolling"])
        self.assertEqual(values["rolling_frequency"], "quarters")

    def test_counts_cumulative_quarters_as_cumulative(self):
        values = year_type_values("Financial multi year cumulative quarters")

        self.assertTrue(values["values_cumulative"])

    def test_refuses_a_year_type_it_has_no_value_for(self):
        with self.assertRaises(ValueError) as raised:
            year_type_values("Fortnightly")

        self.assertIn("Fortnightly", str(raised.exception))


class SameTranslationTest(unittest.TestCase):
    def test_uses_the_values_the_app_knows(self):
        source = UTILS.read_text()
        for value in [*TIME_PERIOD_VALUES, *YEAR_TYPE_VALUES, *ROLLING_FREQUENCY_VALUES]:
            self.assertIn(f"'{value}'", source)

    def test_names_the_year_types_the_data_migration_does(self):
        source = TYPESCRIPT.read_text()
        block = source[source.index("export const YEAR_TYPES") : source.index("export function")]
        names = re.findall(r"^  (?:'([^']+)'|(\w+)):", block, re.MULTILINE)
        self.assertEqual({quoted or bare for quoted, bare in names}, set(YEAR_TYPES))


class ExportsTest(unittest.TestCase):
    def test_exports_no_year_type_table(self):
        self.assertNotIn("year_type", transform["PUBLISHED_TABLES"])
        self.assertNotIn("year_type_id", transform["FOREIGN_KEYS"]["indicator_version"])

    def test_keeps_the_tags_that_fix_published_ids(self):
        self.assertEqual(transform["TABLE_TAGS"]["ci_method"], 4)

    def test_writes_the_time_periods_columns_on_each_version(self):
        for column in YEAR_TYPE_COLUMNS:
            self.assertIn(column, reshape["VERSION_COLUMNS"])


if __name__ == "__main__":
    unittest.main()
