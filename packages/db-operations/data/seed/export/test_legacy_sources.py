"""Checks for reading Fingertips' numerator and denominator sources from the seed."""

import csv
import gzip
import tempfile
import unittest
from pathlib import Path

from legacy_sources import (
    legacy_source,
    legacy_source_ids,
    read_legacy_map,
    version_legacy_sources,
)

SEED_DIR = Path(__file__).resolve().parent.parent


def write_csv(path, rows):
    with gzip.open(path, "wt", newline="", encoding="utf-8") as target:
        writer = csv.writer(target)
        writer.writerows(rows)


class LegacySourceTest(unittest.TestCase):
    ids = {"Office for National Statistics (ONS), Live births": "019fa38f-0000-7000-8000-000000000001"}
    legacy_map = {
        "Office for National Statistics (ONS), Live births": [
            {"provider": "Office for National Statistics (ONS)", "source": "Live births"}
        ]
    }

    def test_gives_the_id_and_pairs_of_a_name_trimmed(self):
        self.assertEqual(
            legacy_source(" Office for National Statistics (ONS), Live births ", self.ids, self.legacy_map),
            (
                "019fa38f-0000-7000-8000-000000000001",
                [{"provider": "Office for National Statistics (ONS)", "source": "Live births"}],
            ),
        )

    def test_gives_nothing_for_no_name(self):
        self.assertEqual(legacy_source(None, self.ids, self.legacy_map), (None, []))

    def test_refuses_a_name_the_seed_does_not_hold(self):
        with self.assertRaises(ValueError) as raised:
            legacy_source("A source nobody has", self.ids, self.legacy_map)

        self.assertIn("A source nobody has", str(raised.exception))

    def test_refuses_a_name_the_map_does_not_cover(self):
        with self.assertRaises(ValueError) as raised:
            legacy_source("Office for National Statistics (ONS), Live births", self.ids, {})

        self.assertIn("legacy-numerator-denominator-sources.json", str(raised.exception))


class SeedReadingTest(unittest.TestCase):
    def test_reads_the_legacy_ids_by_trimmed_name_and_by_version(self):
        with tempfile.TemporaryDirectory() as directory:
            write_csv(
                Path(directory) / "numerator_denominator_source.csv.gz",
                [["id", "name", "url"], ["s1", "Estimated ", ""]],
            )
            write_csv(
                Path(directory) / "indicator_version.csv.gz",
                [
                    ["id", "numerator_source_id", "denominator_source_id"],
                    ["v1", "s1", ""],
                ],
            )

            self.assertEqual(legacy_source_ids(directory), {"Estimated": "s1"})
            self.assertEqual(
                version_legacy_sources(directory),
                {"v1": (None, None, "s1", None, None, None)},
            )

    def test_maps_every_source_the_committed_seed_names(self):
        legacy_map = read_legacy_map()

        self.assertEqual([name for name in legacy_source_ids(SEED_DIR) if name not in legacy_map], [])
