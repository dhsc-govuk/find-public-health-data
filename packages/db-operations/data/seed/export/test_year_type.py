"""Checks for the year type translation the exports apply."""

import re
import runpy
import unittest
from pathlib import Path

from year_type import (
    PERIOD_TYPE_VALUES,
    YEAR_TYPE_VALUES,
    YEAR_TYPES,
    year_type_select,
    year_type_values,
)

transform = runpy.run_path(str(Path(__file__).with_name("transform-uuids.py")))
reshape = runpy.run_path(str(Path(__file__).with_name("reshape-indicator-versions.py")))
MIGRATIONS = Path(__file__).parents[3] / "drizzle"
MIGRATION = MIGRATIONS / "0034_period-type.sql"
VALUES_MIGRATION = MIGRATIONS / "0036_period-and-year-type-values.sql"
UTILS = Path(__file__).parents[4] / "utils" / "src" / "period-type.ts"


class YearTypeValuesTest(unittest.TestCase):
    def test_gives_every_fingertips_year_type_a_service_value(self):
        self.assertEqual(len(YEAR_TYPES), 17)
        for name in YEAR_TYPES:
            values = year_type_values(name)
            self.assertIn(values["period_type"], PERIOD_TYPE_VALUES)
            self.assertIn(values["year_type"], YEAR_TYPE_VALUES)

    def test_keeps_the_three_in_use_in_the_seed_as_years(self):
        for name, year_type in [
            ("Calendar", "calendar"),
            ("Financial", "financial"),
            ("Academic", "academic"),
        ]:
            self.assertEqual(
                year_type_values(name),
                {
                    "period_type": "years",
                    "year_type": year_type,
                    "year_end_day": None,
                    "year_end_month": None,
                },
            )

    def test_gives_a_month_range_the_date_its_year_ends(self):
        self.assertEqual(
            year_type_values("August-July"),
            {
                "period_type": "years",
                "year_type": "specified-end-date",
                "year_end_day": 31,
                "year_end_month": 7,
            },
        )

    def test_gives_a_date_only_to_a_year_ending_on_one(self):
        for name, (_, year_type, year_end) in YEAR_TYPES.items():
            self.assertEqual(year_end is not None, year_type == "specified-end-date", name)

    def test_counts_cumulative_quarters_as_financial_quarters(self):
        values = year_type_values("Financial multi year cumulative quarters")

        self.assertEqual(values["period_type"], "quarters")
        self.assertEqual(values["year_type"], "financial")

    def test_refuses_a_year_type_it_has_no_value_for(self):
        with self.assertRaises(ValueError) as raised:
            year_type_values("Fortnightly")

        self.assertIn("Fortnightly", str(raised.exception))

    def test_selects_all_four_columns(self):
        select = year_type_select("i.year_type_id")

        for column in ["period_type", "year_type", "year_end_day", "year_end_month"]:
            self.assertIn(f" END AS {column}", select)
        self.assertIn("WHEN 'August-July' THEN 31", select)


def values_by_id():
    """The value migration 0036 gives each period and year type row migration 0034 inserted."""
    return dict(re.findall(r"WHEN '([0-9a-f-]{36})' THEN '([a-z-]+)'", VALUES_MIGRATION.read_text()))


class SameTranslationTest(unittest.TestCase):
    def test_uses_the_values_the_app_knows(self):
        source = UTILS.read_text()
        for value in [*PERIOD_TYPE_VALUES, *YEAR_TYPE_VALUES]:
            self.assertIn(f"'{value}'", source)

    def test_translates_as_the_migrations_do(self):
        values = values_by_id()
        rows = re.findall(
            r"\('([^']+)', '([0-9a-f-]{36})'(?:::uuid)?, '([0-9a-f-]{36})'(?:::uuid)?, "
            r"(NULL|\d+)(?:::smallint)?, (NULL|\d+)(?:::smallint)?\)",
            MIGRATION.read_text(),
        )
        self.assertEqual(len(rows), len(YEAR_TYPES))
        for name, period_type_id, year_type_id, day, month in rows:
            self.assertEqual(
                {
                    "period_type": values[period_type_id],
                    "year_type": values[year_type_id],
                    "year_end_day": None if day == "NULL" else int(day),
                    "year_end_month": None if month == "NULL" else int(month),
                },
                year_type_values(name),
                name,
            )


class ExportsTest(unittest.TestCase):
    def test_exports_no_year_type_table(self):
        self.assertNotIn("year_type", transform["PUBLISHED_TABLES"])
        self.assertNotIn("year_type_id", transform["FOREIGN_KEYS"]["indicator_version"])

    def test_keeps_the_tags_that_fix_published_ids(self):
        self.assertEqual(transform["TABLE_TAGS"]["ci_method"], 4)

    def test_writes_the_four_columns_on_each_version(self):
        for column in ["period_type", "year_type", "year_end_day", "year_end_month"]:
            self.assertIn(column, reshape["VERSION_COLUMNS"])


if __name__ == "__main__":
    unittest.main()
