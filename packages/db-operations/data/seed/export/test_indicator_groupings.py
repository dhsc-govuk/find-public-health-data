import runpy
import unittest
from pathlib import Path


export = runpy.run_path(str(Path(__file__).with_name("refresh-indicator-groupings.py")))


class IndicatorGroupingsTest(unittest.TestCase):
    def setUp(self):
        self.indicators = [
            {"id": f"indicator-{short_id}", "short_id": str(short_id)}
            for short_id in export["INDICATORS"]
        ]
        self.types = [{"id": kind, "name": kind} for kind in ("Sex", "Age")]
        self.values = [
            {"id": name, "dimension_type_id": kind, "code": str(code), "name": name}
            for kind, code, name in (
                ("Sex", 1, "Male"),
                ("Sex", 2, "Female"),
                ("Age", 163, "<75 yrs"),
                ("Age", 168, "18+ yrs"),
                ("Age", 173, "<18 yrs"),
            )
        ]
        self.summaries = [
            {
                "IID": short_id,
                "Sex": {"Id": sex_id, "Name": sex},
                "Age": {"Id": age_id, "Name": age},
                "YearRange": year_range,
                "TimePeriod": "2024" if year_range == 1 else "2022 - 24",
            }
            for short_id, sexes, ages, year_ranges in (
                (108, [(4, "Persons"), (2, "Female"), (1, "Male")], [(163, "<75 yrs")], [1, 3]),
                (92443, [(4, "Persons")], [(168, "18+ yrs")], [1, 3]),
                (93622, [(4, "Persons")], [(1, "All ages"), (173, "<18 yrs")], [1]),
            )
            for sex_id, sex in sexes
            for age_id, age in ages
            for year_range in year_ranges
        ]
        for summary in self.summaries:
            if summary["IID"] == 93622:
                summary["TimePeriod"] = "2023/24"

    def rows(self):
        return export["grouping_rows"](self.indicators, self.types, self.values, self.summaries)

    def test_exports_every_published_sex_for_108_and_normalises_aggregates(self):
        rows = self.rows()
        self.assertEqual(len(rows), 10)
        self.assertEqual(
            {
                (row["sex_id"], row["age_id"], row["year_range"])
                for row in rows if row["indicator_id"] == "indicator-108"
            },
            {
                (sex, "<75 yrs", year_range)
                for sex in ("", "Female", "Male") for year_range in (1, 3)
            },
        )
        self.assertEqual(
            {
                (row["sex_id"], row["age_id"])
                for row in rows if row["indicator_id"] == "indicator-93622"
            },
            {("", ""), ("", "<18 yrs")},
        )

    def test_deduplicates_profiles_and_keeps_ids_stable(self):
        expected = self.rows()
        self.summaries = list(reversed(self.summaries * 2))
        self.assertEqual(self.rows(), expected)

    def test_rejects_an_incomplete_response(self):
        self.summaries = [row for row in self.summaries if row["IID"] != 108]
        with self.assertRaisesRegex(ValueError, "Missing published groupings for \\[108\\]"):
            self.rows()

    def test_rejects_unmapped_dimensions(self):
        self.values = [row for row in self.values if row["name"] != "Male"]
        with self.assertRaisesRegex(ValueError, "Unmapped Sex"):
            self.rows()

    def test_rejects_periods_the_fixture_export_cannot_represent(self):
        self.summaries[0]["TimePeriod"] = "2024 Q1"
        with self.assertRaisesRegex(ValueError, "Non-annual grouping for 108"):
            self.rows()


if __name__ == "__main__":
    unittest.main()
