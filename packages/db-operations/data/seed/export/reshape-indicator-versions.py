#!/usr/bin/env python3
"""Split the exported indicator rows into an identity table and a version table.

Run locally after transform-uuids.py:

    python3 reshape-indicator-versions.py ..

indicator.csv.gz keeps only the identity columns; everything a publisher edits,
including the whole of indicator_metadata.csv.gz, moves to a single published
indicator_version row per indicator, under the actor the export already carries.
The Pholio polarity and frequency references become the service's values, the
value type and unit references the service's own rows, the year type reference
the service's period type, year type and year end, and the disclosure control,
caveats and notes prose becomes the service's answers. indicator_metadata.csv.gz,
polarity.csv.gz, frequency.csv.gz, value_type.csv.gz, unit.csv.gz and
year_type.csv.gz are removed.
"""

import csv
import gzip
import os
import secrets
import sys

from notes_and_caveats import NOTES_AND_CAVEATS_COLUMNS, notes_and_caveats
from polarity import polarity_value
from slug import assign_slugs
from update_frequency import update_frequency_value
from value_type_and_unit import UNIT_COLUMNS, unit_values, value_type_id
from year_type import YEAR_TYPE_COLUMNS, year_type_values

IDENTITY_COLUMNS = ["id", "short_id", "data_updated_at", "created_at"]

# The version's own columns, then everything lifted from indicator and indicator_metadata.
VERSION_COLUMNS = [
    "id",
    "indicator_id",
    "status",
    "is_locked",
    "published_at",
    "name",
    "slug",
    "value_type_id",
    *UNIT_COLUMNS,
    *YEAR_TYPE_COLUMNS,
    "ci_method_id",
    "polarity",
    "update_frequency",
    "comparator_method_id",
    "ci_confidence_level",
    "definition",
    "rationale",
    "methodology",
    "numerator_definition",
    "denominator_definition",
    *NOTES_AND_CAVEATS_COLUMNS,
    "data_source_id",
    "numerator_source_id",
    "denominator_source_id",
    "created_at",
    "updated_at",
    "created_by",
    "updated_by",
]

METADATA_COLUMNS = VERSION_COLUMNS[VERSION_COLUMNS.index("definition") : VERSION_COLUMNS.index("created_at")]


def uuid7(ts_ms):
    rand_a = secrets.randbits(12)
    rand_b = secrets.randbits(62)
    value = (ts_ms << 80) | (0x7 << 76) | (rand_a << 64) | (0x2 << 62) | rand_b
    hexed = f"{value:032x}"
    return f"{hexed[:8]}-{hexed[8:12]}-{hexed[12:16]}-{hexed[16:20]}-{hexed[20:]}"


def read_rows(path):
    with gzip.open(path, "rt", newline="") as f:
        return list(csv.DictReader(f))


def write_rows(path, columns, rows):
    tmp = f"{path}.tmp"
    with gzip.open(tmp, "wt", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    os.replace(tmp, path)


def translated_value_type_and_unit(row, value_type_names, unit_names):
    """The version's value type and unit columns for a row referencing Pholio's lookup rows."""
    columns = {"value_type_id": "", "unit_id": "", "unit_detail": ""}
    if row["value_type_id"]:
        columns["value_type_id"] = value_type_id(value_type_names[row["value_type_id"]])
    if row["unit_id"]:
        unit = unit_values(unit_names[row["unit_id"]])
        columns.update({column: value or "" for column, value in unit.items()})
    return columns


def main(seed_dir):
    indicator_path = os.path.join(seed_dir, "indicator.csv.gz")
    metadata_path = os.path.join(seed_dir, "indicator_metadata.csv.gz")
    polarity_path = os.path.join(seed_dir, "polarity.csv.gz")
    frequency_path = os.path.join(seed_dir, "frequency.csv.gz")
    year_type_path = os.path.join(seed_dir, "year_type.csv.gz")
    value_type_path = os.path.join(seed_dir, "value_type.csv.gz")
    unit_path = os.path.join(seed_dir, "unit.csv.gz")

    indicators = read_rows(indicator_path)
    metadata = {row["indicator_id"]: row for row in read_rows(metadata_path)}
    polarity_names = {row["id"]: row["name"] for row in read_rows(polarity_path)}
    frequency_names = {row["id"]: row["name"] for row in read_rows(frequency_path)}
    year_type_names = {row["id"]: row["name"] for row in read_rows(year_type_path)}
    value_type_names = {row["id"]: row["name"] for row in read_rows(value_type_path)}
    unit_names = {row["id"]: row["name"] for row in read_rows(unit_path)}

    # Version ids sort after the indicators they belong to, so UUIDv7 ordering still
    # mirrors the order the rows were created in.
    base_ms = max(int(row["id"].replace("-", "")[:12], 16) for row in indicators) + 1

    # The identity rows still carry the name at this point, before the split writes it away.
    slugs = assign_slugs((row["id"], row["short_id"], row["name"]) for row in indicators)

    versions = []
    for offset, row in enumerate(sorted(indicators, key=lambda r: int(r["short_id"]))):
        version = {column: "" for column in VERSION_COLUMNS}
        version.update({column: row.get(column, "") for column in VERSION_COLUMNS})
        prose = metadata.get(row["id"], {})
        version.update({column: prose.get(column, "") for column in METADATA_COLUMNS})
        version.update(
            {column: value or "" for column, value in notes_and_caveats(prose).items()}
        )
        version["id"] = uuid7(base_ms + offset)
        version["indicator_id"] = row["id"]
        version["slug"] = slugs[row["id"]]
        version["polarity"] = (
            polarity_value(polarity_names[row["polarity_id"]]) if row["polarity_id"] else ""
        )
        version["update_frequency"] = (
            update_frequency_value(frequency_names[row["frequency_id"]])
            if row["frequency_id"]
            else ""
        )
        if row["year_type_id"]:
            version.update(
                {
                    column: "" if value is None else value
                    for column, value in year_type_values(
                        year_type_names[row["year_type_id"]]
                    ).items()
                }
            )
        version.update(translated_value_type_and_unit(row, value_type_names, unit_names))
        version["status"] = "published"
        version["is_locked"] = "t"
        version["published_at"] = row["updated_at"]
        versions.append(version)

    write_rows(indicator_path, IDENTITY_COLUMNS, indicators)
    write_rows(os.path.join(seed_dir, "indicator_version.csv.gz"), VERSION_COLUMNS, versions)
    os.remove(metadata_path)
    os.remove(polarity_path)
    os.remove(frequency_path)
    os.remove(year_type_path)
    os.remove(value_type_path)
    os.remove(unit_path)

    print(f"indicator: {len(indicators)} identity rows")
    print(f"indicator_version: {len(versions)} published versions")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "..")
