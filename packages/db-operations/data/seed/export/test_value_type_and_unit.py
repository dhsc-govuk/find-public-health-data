"""Checks for the value type and unit translation the exports apply."""

import json
import re
import runpy
import sqlite3
import unittest
from contextlib import closing
from pathlib import Path

from value_type_and_unit import (
    UNIT_COLUMNS,
    UNIT_IDS,
    UNIT_NAMES_BY_LABEL,
    UNIT_PLACEHOLDERS,
    UNITS,
    VALUE_TYPE_IDS,
    VALUE_TYPES,
    unit_name_for_label,
    unit_select,
    unit_values,
    unknown_units,
    unknown_value_types,
    value_type_id,
)

transform = runpy.run_path(str(Path(__file__).with_name("transform-uuids.py")))
reshape = runpy.run_path(str(Path(__file__).with_name("reshape-indicator-versions.py")))
(migration,) = Path(__file__).parents[3].glob("drizzle/*_value-type-and-units.sql")
# Every value type and unit row in Pholio, each with the service value it translates to.
PHOLIO = json.loads(
    Path(__file__).parents[3].joinpath("src/pholio-value-types-and-units.json").read_text()
)
CORE_VALUE_TYPES = json.loads(Path(__file__).parents[2].joinpath("value-types.json").read_text())
CORE_UNITS = json.loads(Path(__file__).parents[2].joinpath("units.json").read_text())


class ValueTypeIdTest(unittest.TestCase):
    def test_keeps_each_service_value_type(self):
        for row in CORE_VALUE_TYPES:
            with self.subTest(name=row["name"]):
                self.assertEqual(value_type_id(row["name"]), row["id"])

    def test_gives_every_pholio_value_type_its_service_value(self):
        for row in PHOLIO["valueTypes"]:
            with self.subTest(name=row["name"]):
                self.assertEqual(value_type_id(row["name"]), VALUE_TYPE_IDS[row["service"]])

    def test_translates_a_placeholder_as_the_value_type_the_fingertips_api_names(self):
        placeholders = [row for row in PHOLIO["valueTypes"] if "fingertipsApi" in row]
        self.assertEqual([row["name"] for row in placeholders], ["Unknown value type 21"])
        for row in placeholders:
            self.assertEqual(value_type_id(row["name"]), value_type_id(row["fingertipsApi"]["name"]))

    def test_refuses_a_value_type_it_has_no_value_for(self):
        for name in ["Unknown value type 22", "Weighted mean"]:
            with self.assertRaises(ValueError) as raised:
                value_type_id(name)

            self.assertIn(name, str(raised.exception))


class UnitValuesTest(unittest.TestCase):
    def test_gives_each_listed_fingertips_unit_a_row_the_core_data_holds(self):
        core = {row["name"]: row["id"] for row in CORE_UNITS}
        for name, service in UNITS.items():
            with self.subTest(name=name):
                self.assertEqual(unit_values(name)["unit_id"], core[service])

    def test_gives_each_fingertips_unit_in_the_list_its_row(self):
        self.assertEqual(
            {
                name: unit_values(name)["unit_id"]
                for name in ["Percent", "per 100,000", "Minutes", "Days", "Years", "No unit"]
            },
            {
                "Percent": UNIT_IDS["%"],
                "per 100,000": UNIT_IDS["per 100,000"],
                "Minutes": UNIT_IDS["minutes"],
                "Days": UNIT_IDS["days"],
                "Years": UNIT_IDS["years"],
                "No unit": UNIT_IDS["No unit"],
            },
        )
        self.assertIsNone(unit_values("Percent")["unit_detail"])

    def test_names_any_other_unit_as_fingertips_named_it(self):
        self.assertEqual(
            unit_values("per 1,000, per day "),
            {"unit_id": UNIT_IDS["Other"], "unit_detail": "per 1,000, per day"},
        )
        self.assertEqual(
            unit_values("Percentage points"),
            {"unit_id": UNIT_IDS["Other"], "unit_detail": "Percentage points"},
        )

    def test_refuses_an_unknown_placeholder_or_a_name_too_long_to_keep(self):
        for name in ["Unknown unit 99", " ", "x" * 301]:
            with self.assertRaises(ValueError):
                unit_values(name)

    def test_gives_every_pholio_unit_its_service_value(self):
        for row in PHOLIO["units"]:
            with self.subTest(name=row["name"]):
                self.assertEqual(
                    unit_values(row["name"]),
                    {"unit_id": UNIT_IDS[row["service"]], "unit_detail": row["other"]},
                )


class UnitPlaceholdersTest(unittest.TestCase):
    def test_names_each_pholio_placeholder_as_the_unit_the_fingertips_api_describes(self):
        named = [row for row in PHOLIO["units"] if "fingertipsApi" not in row]
        placeholders = {}
        for row in PHOLIO["units"]:
            if "fingertipsApi" in row:
                api = row["fingertipsApi"]
                (twin,) = [
                    unit["name"]
                    for unit in named
                    if (unit["label"], unit["multiplier"]) == (api["label"], api["multiplier"])
                ]
                placeholders[row["name"]] = twin

        self.assertEqual(UNIT_PLACEHOLDERS, placeholders)


class UnitNameForLabelTest(unittest.TestCase):
    def test_gives_the_name_the_migration_and_exports_translate(self):
        self.assertEqual(unit_name_for_label("%"), "Percent")
        self.assertEqual(unit_name_for_label("min"), "Minutes")
        self.assertEqual(unit_name_for_label("per 100,000"), "per 100,000")
        self.assertEqual(unit_values(unit_name_for_label("min"))["unit_id"], UNIT_IDS["minutes"])

    def test_names_only_listed_units(self):
        self.assertLessEqual(set(UNIT_NAMES_BY_LABEL.values()), set(UNITS))

    def test_refuses_a_label_it_cannot_name(self):
        # "£" is also the label of "£ per 100,000"; "per 1,000/day" names "per 1,000, per day ".
        for label in ["£", "per 1,000/day", "kg/m2", "Unknown"]:
            with self.assertRaises(ValueError) as raised:
                unit_name_for_label(label)

            self.assertIn(label, str(raised.exception))


class UnknownNamesTest(unittest.TestCase):
    def test_lists_the_names_it_cannot_translate(self):
        self.assertEqual(
            unknown_value_types(["Count", "Months life lost", "Weighted mean", ""]),
            ["", "Weighted mean"],
        )
        self.assertEqual(
            unknown_units(["Percent", "Kg/m2", "Unknown unit 54", "Unknown unit 99", "", "  "]),
            ["", "  ", "Unknown unit 99"],
        )

    def test_can_translate_every_pholio_value_type_and_unit(self):
        self.assertEqual(unknown_value_types(row["name"] for row in PHOLIO["valueTypes"]), [])
        self.assertEqual(unknown_units(row["name"] for row in PHOLIO["units"]), [])


def selected_unit(name):
    """unit_select's columns for a Pholio unit with this name, or for no unit when it is None."""
    with closing(sqlite3.connect(":memory:")) as db:
        # Postgres's btrim with one argument trims spaces.
        db.create_function("btrim", 1, lambda value: None if value is None else value.strip(" "))
        db.execute("CREATE TABLE unit (id INTEGER PRIMARY KEY, name TEXT NOT NULL)")
        if name is not None:
            db.execute("INSERT INTO unit VALUES (1, ?)", [name])
        row = db.execute(f"SELECT {unit_select(':unit_id')}", {"unit_id": 1}).fetchone()
    return dict(zip(UNIT_COLUMNS, row))


class UnitSelectTest(unittest.TestCase):
    def test_leaves_no_unit_unanswered(self):
        self.assertEqual(selected_unit(None), {"unit_id": None, "unit_detail": None})

    def test_agrees_with_unit_values(self):
        for name in [row["name"] for row in PHOLIO["units"]]:
            with self.subTest(name=name):
                self.assertEqual(selected_unit(name), unit_values(name))

    def test_leaves_a_blank_or_unknown_placeholder_name_to_the_check_before_it(self):
        for name in ["", "  ", "Unknown unit 99"]:
            with self.subTest(name=name):
                with self.assertRaises(ValueError):
                    unit_values(name)
                self.assertEqual(unknown_units([name]), [name])


def migration_statement(marker):
    """The one statement in the migration containing this text."""
    (statement,) = [
        statement
        for statement in migration.read_text().split("--> statement-breakpoint")
        if marker in statement
    ]
    return statement


def migration_translation(column):
    """The Fingertips names and ids in the migration's translation of this column."""
    statement = migration_statement(f'SET "{column}" = m.{column}')
    return dict(re.findall(r"\('((?:[^']|'')*)', '([0-9a-f-]{36})'", statement))


def migration_unit_placeholders():
    """The placeholder unit names and the names the migration gives them."""
    statement = migration_statement("AS m(placeholder, name)")
    pairs = re.findall(r"\('((?:[^']|'')*)', '((?:[^']|'')*)'\)", statement)
    return {placeholder.replace("''", "'"): name.replace("''", "'") for placeholder, name in pairs}


class MigrationTest(unittest.TestCase):
    def test_holds_the_same_value_type_translation(self):
        self.assertEqual(
            migration_translation("value_type_id"),
            {name: value_type_id(name) for name in VALUE_TYPES},
        )

    def test_holds_the_same_unit_translation(self):
        self.assertEqual(
            migration_translation("unit_id"),
            {name: unit_values(name)["unit_id"] for name in UNITS},
        )

    def test_holds_the_same_placeholder_units(self):
        self.assertEqual(migration_unit_placeholders(), UNIT_PLACEHOLDERS)


class ReshapeTest(unittest.TestCase):
    def test_translates_a_pholio_row_to_the_version_columns(self):
        self.assertEqual(
            reshape["translated_value_type_and_unit"](
                {"value_type_id": "v", "unit_id": "u"},
                {"v": "Directly standardised rate"},
                {"u": "per 1,000 live births"},
            ),
            {
                "value_type_id": VALUE_TYPE_IDS["Directly standardised rate"],
                "unit_id": UNIT_IDS["Other"],
                "unit_detail": "per 1,000 live births",
            },
        )


class PublishedTablesTest(unittest.TestCase):
    def test_exports_no_value_type_or_unit_table(self):
        for table in ["value_type", "unit"]:
            self.assertNotIn(table, transform["PUBLISHED_TABLES"])
            self.assertNotIn(f"{table}_id", transform["FOREIGN_KEYS"]["indicator_version"])


if __name__ == "__main__":
    unittest.main()
