#!/usr/bin/env python3
"""Convert the integer-keyed CSVs produced by export-seed.py to UUIDv7 keys.

Run locally after downloading the export:

    python3 transform-uuids.py ..

The default mode assigns sequential UUIDv7 ids following source-id order and
reads the Pholio-shaped export from export-seed.py. `--deterministic` maps table
and source ID directly to UUIDv7 so a full published snapshot can be converted
with bounded memory, and reads the version-shaped export from
an integer-keyed source snapshot. Every foreign key is remapped, each writer
becomes its system user's id, and the indicator keeps its public Fingertips
number as `short_id`.
"""

import argparse
import csv
import gzip
import hashlib
import json
import os
import secrets
import time
from pathlib import Path

from published_csv import NULL_MARKER, write_published_row

TABLES = [
    "value_type",
    "unit",
    "year_type",
    "ci_method",
    "polarity",
    "frequency",
    "comparator_method",
    "data_source",
    "numerator_denominator_source",
    "dimension_type",
    "dimension_value",
    "area_type",
    "area",
    "area_relationship",
    "indicator",
    "indicator_metadata",
    "upload_batch",
    "note_type",
    "observation",
    "observation_dimension",
    "observation_note",
]
# The published export carries indicator_version where the Pholio shape carries indicator_metadata.
TAGGED_TABLES = [
    "indicator_version" if table == "indicator_metadata" else table for table in TABLES
]
# Tagged by position in the full list, so a table the export stops carrying moves no id.
TABLE_TAGS = {table: index + 1 for index, table in enumerate(TAGGED_TABLES)}
# The polarity, frequency and year type are exported as values rather than references to lookup
# rows, and the value type and unit as references to the service's own core data rows.
PUBLISHED_TABLES = [
    table
    for table in TAGGED_TABLES
    if table not in ("polarity", "frequency", "year_type", "value_type", "unit")
]

FOREIGN_KEYS = {
    "dimension_value": {"dimension_type_id": "dimension_type", "parent_id": "dimension_value"},
    "area": {"area_type_id": "area_type"},
    "area_relationship": {"parent_area_id": "area", "child_area_id": "area"},
    "indicator": {
        "value_type_id": "value_type",
        "unit_id": "unit",
        "year_type_id": "year_type",
        "ci_method_id": "ci_method",
        "polarity_id": "polarity",
        "frequency_id": "frequency",
        "comparator_method_id": "comparator_method",
        "supersedes_id": "indicator",
    },
    "indicator_metadata": {
        "indicator_id": "indicator",
        "data_source_id": "data_source",
        "numerator_source_id": "numerator_denominator_source",
        "denominator_source_id": "numerator_denominator_source",
    },
    "indicator_version": {
        "indicator_id": "indicator",
        "ci_method_id": "ci_method",
        "comparator_method_id": "comparator_method",
        "data_source_id": "data_source",
        "numerator_source_id": "numerator_denominator_source",
        "denominator_source_id": "numerator_denominator_source",
    },
    "upload_batch": {"indicator_id": "indicator"},
    "observation": {
        "indicator_id": "indicator",
        "area_id": "area",
        "upload_batch_id": "upload_batch",
    },
    "observation_dimension": {
        "observation_id": "observation",
        "dimension_value_id": "dimension_value",
        "dimension_type_id": "dimension_type",
    },
    "observation_note": {"observation_id": "observation", "note_type_id": "note_type"},
}

# The writer the exports name, as the system user it is (SYSTEM_USER_IDS in @fphd/db).
ACTOR_USER_IDS = {"pholio-migration": "01a13c69-96ab-7598-9ce0-f0c3bd77bded"}
# The columns naming a row's writer. observation.created_by is not one: the loader ignores it.
ACTOR_COLUMNS = {
    "indicator": ["created_by", "updated_by"],
    "indicator_version": ["created_by", "updated_by"],
    "upload_batch": ["uploaded_by"],
}


def uuid7(ts_ms):
    rand_a = secrets.randbits(12)
    rand_b = secrets.randbits(62)
    value = (ts_ms << 80) | (0x7 << 76) | (rand_a << 64) | (0x2 << 62) | rand_b
    hexed = f"{value:032x}"
    return f"{hexed[:8]}-{hexed[8:12]}-{hexed[12:16]}-{hexed[16:20]}-{hexed[20:]}"


def deterministic_uuid7(table, old_id):
    numeric_id = int(old_id)
    encoded_id = 2 * numeric_id if numeric_id >= 0 else -2 * numeric_id - 1
    if encoded_id >= 1 << 62:
        raise ValueError(f"{table} id is outside the supported range: {old_id}")
    table_tag = TABLE_TAGS[table]
    timestamp_ms = 1777593600000  # 2026-05-01, before the published benchmark snapshot.
    value = (timestamp_ms << 80) | (0x7 << 76) | (table_tag << 64) | (0x2 << 62) | encoded_id
    hexed = f"{value:032x}"
    return f"{hexed[:8]}-{hexed[8:12]}-{hexed[12:16]}-{hexed[16:20]}-{hexed[20:]}"


def foreign_key_indexes(table, header):
    """Map the position of each of the table's foreign-key columns to the table it references."""
    fks = FOREIGN_KEYS.get(table, {})
    # Only the published export's indicator row, which holds identity columns alone, may lack them,
    # and then it lacks all of them.
    missing = [col for col in fks if col not in header]
    identity_only = table == "indicator" and len(missing) == len(fks)
    if missing and not identity_only:
        raise ValueError(f"{table} is missing foreign-key columns: {', '.join(missing)}")
    return {header.index(col): ref for col, ref in fks.items() if col in header}


def actor_indexes(table, header):
    """The positions of the table's writer columns; the identity-only indicator row has none."""
    return [header.index(column) for column in ACTOR_COLUMNS.get(table, []) if column in header]


def actor_user_id(table, actor):
    """The id of the user a writer is, or an error naming a writer no user stands for."""
    user_id = ACTOR_USER_IDS.get(actor)
    if user_id is None:
        raise ValueError(f"{table} names a writer with no user: {actor}")
    return user_id


def main(seed_dir, deterministic=False):
    tables = PUBLISHED_TABLES if deterministic else TABLES
    if deterministic:
        source_manifest = json.loads(Path(seed_dir, "source-manifest.json").read_text())
        if source_manifest["source"] != "PHOLIO_LIVE_A-derived fphd_new benchmark clone":
            raise ValueError("Deterministic transform requires the published benchmark export")
        if source_manifest.get("source_csv_null") != NULL_MARKER:
            raise ValueError("Published export must distinguish NULL from empty strings")
        if set(source_manifest["tables"]) != set(tables):
            raise ValueError("The published export is missing one or more tables")
        convert = deterministic_uuid7
    else:
        base_ms = int(time.time() * 1000)
        id_maps = {}
        for table in tables:
            path = os.path.join(seed_dir, f"{table}.csv.gz")
            with gzip.open(path, "rt", newline="") as f:
                reader = csv.reader(f)
                header = next(reader)
                id_index = header.index("id")
                old_ids = sorted((int(row[id_index]) for row in reader))
            id_maps[table] = {
                str(old): uuid7(base_ms + offset) for offset, old in enumerate(old_ids)
            }
            base_ms += len(old_ids)

        def convert(table, old_id):
            return id_maps[table][old_id]

    for table in tables:
        path = os.path.join(seed_dir, f"{table}.csv.gz")
        tmp = f"{path}.tmp"
        with gzip.open(path, "rt", newline="") as src, gzip.open(tmp, "wt", newline="") as dst:
            reader, writer = csv.reader(src), csv.writer(dst)
            header = next(reader)
            id_index = header.index("id")
            fk_indexes = foreign_key_indexes(table, header)
            actors = actor_indexes(table, header)
            if table == "indicator":
                writer.writerow([*header[: id_index + 1], "short_id", *header[id_index + 1 :]])
            else:
                writer.writerow(header)
            rows = 0
            for row in reader:
                old_id = row[id_index]
                row[id_index] = convert(table, old_id)
                for i, ref_table in fk_indexes.items():
                    if row[i] not in ("", NULL_MARKER):
                        row[i] = convert(ref_table, row[i])
                for i in actors:
                    row[i] = actor_user_id(table, row[i])
                if table == "indicator":
                    row = [*row[: id_index + 1], old_id, *row[id_index + 1 :]]
                if deterministic:
                    write_published_row(dst, row, final=True)
                else:
                    writer.writerow(row)
                rows += 1
        if deterministic and rows != source_manifest["tables"][table]["rows"]:
            raise ValueError(f"{table} row count changed during UUID conversion")
        os.replace(tmp, path)
        print(f"{table}: {rows} rows rekeyed")

    if deterministic:
        manifest = {**source_manifest, "id_mapping": "deterministic-uuidv7-v1"}
        for table in tables:
            path = Path(seed_dir, f"{table}.csv.gz")
            digest = hashlib.sha256()
            with path.open("rb") as file:
                while chunk := file.read(1024 * 1024):
                    digest.update(chunk)
            source = source_manifest["tables"][table]
            manifest["tables"][table] = {
                "rows": source["rows"],
                "bytes": path.stat().st_size,
                "sha256": digest.hexdigest(),
            }
        manifest_path = Path(seed_dir, "manifest.json")
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("seed_dir", nargs="?", default="..")
    parser.add_argument("--deterministic", action="store_true")
    args = parser.parse_args()
    main(args.seed_dir, deterministic=args.deterministic)
