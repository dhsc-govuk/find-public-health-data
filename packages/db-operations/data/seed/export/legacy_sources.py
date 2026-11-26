"""Fingertips' numerator and denominator sources, which the seed keeps as Pholio shaped them.

The service has neither the numerator_denominator_source table nor the version columns that
name its rows: the seed load maps each name onto the core data providers through
../../legacy-numerator-denominator-sources.json. A script that writes the seed CSVs therefore
reads the legacy ids from the seed itself, and stops at a name the map does not cover.
"""

import csv
import gzip
import json
from pathlib import Path

LEGACY_COLUMNS = ("numerator_source_id", "denominator_source_id")

# The version columns the seed keeps as Fingertips shaped them, which the seed load turns into
# the service's indicator format and sources: the definitions and legacy sources of the
# numerator and denominator, and the one disclosure control answer for the whole indicator.
FINGERTIPS_VERSION_COLUMNS = (
    "numerator_definition",
    "denominator_definition",
    *LEGACY_COLUMNS,
    "disclosure_control",
    "disclosure_control_detail",
)

LEGACY_MAP_PATH = Path(__file__).resolve().parents[2] / "legacy-numerator-denominator-sources.json"


def read_legacy_map(path=LEGACY_MAP_PATH):
    with open(path, encoding="utf-8") as source:
        return json.load(source)


def legacy_source_ids(seed_dir):
    """Each legacy source's id by its name, as the load matches it: trimmed."""
    with gzip.open(Path(seed_dir) / "numerator_denominator_source.csv.gz", "rt", newline="") as source:
        return {row["name"].strip(): row["id"] for row in csv.DictReader(source)}


def version_legacy_sources(seed_dir):
    """Each seeded version's Fingertips-shaped columns, which the database holds in other forms."""
    with gzip.open(Path(seed_dir) / "indicator_version.csv.gz", "rt", newline="") as source:
        return {
            row["id"]: tuple(row.get(column) or None for column in FINGERTIPS_VERSION_COLUMNS)
            for row in csv.DictReader(source)
        }


def legacy_source(name, ids, legacy_map):
    """The id of the legacy source a Fingertips name gives, and the pairs it maps to."""
    if not name:
        return None, []
    key = name.strip()
    if key not in ids:
        raise ValueError(f"No numerator_denominator_source row named {key!r} in the seed")
    if key not in legacy_map:
        raise ValueError(
            f"No mapping for the source {key!r}: add it to legacy-numerator-denominator-sources.json"
        )
    return ids[key], legacy_map[key]
