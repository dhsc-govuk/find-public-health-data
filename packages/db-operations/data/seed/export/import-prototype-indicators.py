#!/usr/bin/env python3
"""Import the prototype showcase indicators into a local seeded Postgres database.

Inputs are files downloaded from the public Fingertips API. The importer only connects
to the local database configured in the repository .env file. It adds the missing
indicator, geography, dimension and observation rows in one transaction, validates the
result, then exports the changed seed tables to a staging directory.
"""

import argparse
import csv
import gzip
import json
import os
import secrets
import time
from datetime import date
from pathlib import Path

import psycopg2
from psycopg2.extras import Json, execute_values

from count_and_numerator import count_is_numerator
from legacy_sources import (
    LEGACY_COLUMNS,
    legacy_source,
    legacy_source_ids,
    read_legacy_map,
    version_legacy_sources,
)
from notes_and_caveats import notes_and_caveats
from slug import slug_problem, slugify
from value_type_and_unit import unit_name_for_label, unit_values, value_type_id
from year_type import year_type_values


INDICATOR_CONFIG = {
    241: {
        "polarity": "no-comparison-possible",
        "comparator": "Confidence intervals overlapping reference value (95.0 & 99.8)",
        "confidence": "both",
    },
    93861: {
        "polarity": "lower-is-better",
        "comparator": "No comparison",
        "confidence": None,
    },
    93995: {
        "polarity": "lower-is-better",
        "comparator": "Confidence intervals overlapping reference value (95.0 & 99.8)",
        "confidence": "both",
    },
}

AREA_VALID_FROM = {
    173: date(2020, 4, 1),
    174: date(2021, 4, 1),
    175: date(2023, 4, 1),
    221: date(2022, 7, 1),
    223: date(2022, 7, 1),
}

IMD_TREND_TYPE = "LSOA21 deprivation deciles within area (IMD trend)"
IMD_TREND_VALUES = [
    "Most deprived decile",
    "Second most deprived decile",
    "Third more deprived decile",
    "Fourth more deprived decile",
    "Fifth more deprived decile",
    "Fifth less deprived decile",
    "Fourth less deprived decile",
    "Third less deprived decile",
    "Second least deprived decile",
    "Least deprived decile",
]

EXPORT_TABLES = [
    "dimension_type",
    "dimension_value",
    "area",
    "indicator",
    "indicator_version",
    "upload_batch",
    "observation",
    "observation_dimension",
    "observation_note",
]

LOCAL_DB_HOSTS = {"localhost", "127.0.0.1", "::1"}
# SYSTEM_USER_IDS.testSeed in @fphd/db: the user the imported records are written by.
TEST_SEED_USER_ID = "01a13c69-96ab-7598-9ce0-f5fa1e68080a"


def uuid7():
    ts_ms = int(time.time() * 1000)
    rand_a = secrets.randbits(12)
    rand_b = secrets.randbits(62)
    value = (ts_ms << 80) | (0x7 << 76) | (rand_a << 64) | (0x2 << 62) | rand_b
    hexed = f"{value:032x}"
    return f"{hexed[:8]}-{hexed[8:12]}-{hexed[12:16]}-{hexed[16:20]}-{hexed[20:]}"


def repo_env(repo_root):
    values = {}
    env_path = repo_root / ".env"
    if env_path.exists():
        for raw in env_path.read_text().splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            values[key.strip()] = value
    return {**values, **os.environ}


def connect(repo_root):
    env = repo_env(repo_root)
    host = env.get("DB_HOST", "localhost")
    if host not in LOCAL_DB_HOSTS:
        raise ValueError(
            f"Refusing to connect to non-local database host {host!r}; "
            "this importer is for local Docker Postgres only"
        )
    return psycopg2.connect(
        host=host,
        port=int(env.get("DB_PORT", "5432")),
        dbname=env.get("POSTGRES_DB", "fphd"),
        user=env.get("POSTGRES_USER", "fphd"),
        password=env.get("POSTGRES_PASSWORD", "fphd"),
    )


# The exclusion constraint reports a slug another indicator already holds; this
# reports the names that yield no slug at all.
def version_slug(fingertips_id, name):
    problem = slug_problem(name)
    if problem:
        raise SystemExit(f"Indicator {fingertips_id} has a name with no usable slug ({problem}): {name!r}")
    return slugify(name)


def one_id(cur, table, name):
    cur.execute(f'SELECT id FROM "{table}" WHERE name = %s', (name,))
    row = cur.fetchone()
    if row is None:
        raise ValueError(f"Missing {table} row: {name}")
    return row[0]


def optional_id(cur, table, name):
    if not name:
        return None
    cur.execute(f'SELECT id FROM "{table}" WHERE name = %s', (name,))
    row = cur.fetchone()
    if row is None:
        raise ValueError(f"Missing {table} row: {name}")
    return row[0]


def parse_period(period):
    if "/" in period:
        start = int(period[:4])
        return date(start, 4, 1), date(start + 1, 3, 31)
    if " - " in period:
        start_text, end_text = period.split(" - ", 1)
        start = int(start_text)
        end = int(end_text) if len(end_text) == 4 else (start // 100) * 100 + int(end_text)
        return date(start, 1, 1), date(end, 12, 31)
    year = int(period)
    return date(year, 1, 1), date(year, 12, 31)


def number(value):
    return None if value == "" else float(value)


def add_imd_dimension(cur):
    cur.execute("SELECT id FROM dimension_type WHERE name = %s", (IMD_TREND_TYPE,))
    row = cur.fetchone()
    if row is None:
        dimension_type_id = uuid7()
        cur.execute(
            """
            INSERT INTO dimension_type
              (id, name, dimension_class, classification_scheme, granularity,
               scheme_version, is_required)
            VALUES (%s, %s, 'inequality', 'English indices of deprivation', 'decile',
                    'IMD trend', false)
            """,
            (dimension_type_id, IMD_TREND_TYPE),
        )
    else:
        dimension_type_id = row[0]

    cur.execute(
        "SELECT name FROM dimension_value WHERE dimension_type_id = %s",
        (dimension_type_id,),
    )
    existing = {row[0] for row in cur.fetchall()}
    rows = [
        (uuid7(), dimension_type_id, name, str(index), index)
        for index, name in enumerate(IMD_TREND_VALUES, 1)
        if name not in existing
    ]
    if rows:
        execute_values(
            cur,
            """
            INSERT INTO dimension_value
              (id, dimension_type_id, name, code, sort_order, is_aggregate)
            VALUES %s
            """,
            rows,
            template="(%s, %s, %s, %s, %s, false)",
        )


def load_area_registry(area_dir, area_types_path):
    with open(area_types_path, encoding="utf-8") as source:
        type_names = {int(row["Id"]): row["Short"] for row in json.load(source)}

    areas = {}
    for area_type_id in (6, 7, 221, 223, 501, 502):
        with open(Path(area_dir) / f"fphd-areas-{area_type_id}.json", encoding="utf-8") as source:
            for row in json.load(source):
                source_type_id = int(row["AreaTypeId"])
                areas[row["Code"]] = {
                    "code": row["Code"],
                    "name": row["Name"],
                    "source_type_id": source_type_id,
                    "area_type": type_names[source_type_id],
                }
    areas["E92000001"] = {
        "code": "E92000001",
        "name": "England",
        "source_type_id": 15,
        "area_type": type_names[15],
    }
    return areas


def add_areas(cur, registry):
    cur.execute("SELECT id, code FROM area WHERE is_current = true")
    area_ids = {code: area_id for area_id, code in cur.fetchall()}
    cur.execute("SELECT name, id FROM area_type")
    area_type_ids = dict(cur.fetchall())

    rows = []
    for code, item in registry.items():
        if code in area_ids:
            continue
        area_id = uuid7()
        area_ids[code] = area_id
        rows.append(
            (
                area_id,
                code,
                item["name"],
                area_type_ids[item["area_type"]],
                AREA_VALID_FROM.get(item["source_type_id"], date(2000, 1, 1)),
            )
        )

    if rows:
        execute_values(
            cur,
            """
            INSERT INTO area (id, code, name, area_type_id, valid_from)
            VALUES %s
            """,
            rows,
            page_size=5000,
        )
    return area_ids, len(rows)


def add_version_sources(cur, version_id, part, pairs):
    """Writes the providers and sources a legacy source maps to, as the seed load does."""
    for position, pair in enumerate(pairs):
        provider_id = one_id(cur, "data_provider", pair["provider"])
        source_id = None
        if pair["source"] is not None:
            cur.execute(
                "SELECT id FROM data_provider_source WHERE provider_id = %s AND name = %s",
                (provider_id, pair["source"]),
            )
            row = cur.fetchone()
            if row is None:
                raise ValueError(f"Missing data_provider_source row: {pair}")
            source_id = row[0]
        cur.execute(
            """
            INSERT INTO indicator_version_source
              (indicator_version_id, part, position, provider_id, source_id)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (version_id, part, position, provider_id, source_id),
        )


def add_indicators(cur, metadata, seed_dir):
    cur.execute(
        "SELECT short_id FROM indicator WHERE short_id = ANY(%s)",
        (list(INDICATOR_CONFIG),),
    )
    existing = [row[0] for row in cur.fetchall()]
    if existing:
        raise ValueError(f"Prototype indicators already exist in local database: {existing}")

    indicator_ids = {}
    batch_ids = {}
    # The legacy source ids each new version names, which only the exported CSV carries.
    version_sources = {}
    source_ids = legacy_source_ids(seed_dir)
    legacy_map = read_legacy_map()
    for fingertips_id, config in INDICATOR_CONFIG.items():
        item = metadata[str(fingertips_id)]
        descriptive = item["Descriptive"]
        indicator_id = uuid7()
        batch_id = uuid7()
        indicator_ids[str(fingertips_id)] = indicator_id
        batch_ids[str(fingertips_id)] = batch_id

        version_id = uuid7()
        numerator_id, numerator_pairs = legacy_source(
            descriptive.get("CountSource"), source_ids, legacy_map
        )
        denominator_id, denominator_pairs = legacy_source(
            descriptive.get("DenomSource"), source_ids, legacy_map
        )
        version_sources[version_id] = (numerator_id, denominator_id)

        unit_name = unit_name_for_label(item["Unit"]["Label"])
        updated_at = item["DataChange"]["LastUploadedAt"]
        cur.execute(
            """
            INSERT INTO indicator (id, short_id, data_updated_at, created_at)
            VALUES (%s, %s, %s, %s)
            """,
            (indicator_id, fingertips_id, updated_at, updated_at),
        )

        cur.execute(
            """
            INSERT INTO indicator_version
              (id, indicator_id, status, is_locked, published_at, name, slug, value_type_id,
               unit_id, unit_detail, period_type, year_type, year_end_day, year_end_month,
               ci_method_id, polarity, update_frequency, comparator_method_id,
               ci_confidence_level, definition, rationale, methodology,
               numerator_definition, denominator_definition, disclosure_control,
               disclosure_control_detail, has_rounding, rounding_detail, has_caveats,
               caveats_detail, has_other_notes, other_notes_detail, data_source_id,
               created_at, created_by, updated_at, updated_by)
            VALUES
              (%s, %s, 'published', true, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
               %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
               %s, %s, %s, %s)
            """,
            (
                version_id,
                indicator_id,
                updated_at,
                descriptive["Name"],
                version_slug(fingertips_id, descriptive["Name"]),
                value_type_id(item["ValueType"]["Name"]),
                *unit_values(unit_name).values(),
                *year_type_values(item["YearType"]["Name"]).values(),
                one_id(cur, "ci_method", item["ConfidenceIntervalMethod"]["Name"]),
                config["polarity"],
                "annually",
                one_id(cur, "comparator_method", config["comparator"]),
                config["confidence"],
                descriptive.get("Definition"),
                descriptive.get("Rationale"),
                descriptive.get("IndMethod"),
                descriptive.get("CountDefinition"),
                descriptive.get("DenomDefinition"),
                *notes_and_caveats(
                    {
                        "disclosure_control": descriptive.get("DiscControl"),
                        "caveats": descriptive.get("Caveats"),
                        "notes": descriptive.get("Notes"),
                    }
                ).values(),
                optional_id(cur, "data_source", descriptive.get("DataSource")),
                updated_at,
                TEST_SEED_USER_ID,
                updated_at,
                TEST_SEED_USER_ID,
            ),
        )
        add_version_sources(cur, version_id, "numerator", numerator_pairs)
        add_version_sources(cur, version_id, "denominator", denominator_pairs)

        cur.execute(
            """
            INSERT INTO upload_batch
              (id, indicator_id, indicator_version_id, original_filename, uploaded_by,
               uploaded_at, status, validation_result)
            VALUES (%s, %s, %s, %s, %s, %s, 'processed', %s)
            """,
            (
                batch_id,
                indicator_id,
                version_id,
                f"fingertips-{fingertips_id}.csv",
                TEST_SEED_USER_ID,
                updated_at,
                Json({"source": "Public Fingertips API", "validated": True}),
            ),
        )
        cur.execute(
            "UPDATE indicator_version SET upload_batch_id = %s, data_table_confirmed_at = %s "
            "WHERE id = %s",
            (batch_id, updated_at, version_id),
        )
    return indicator_ids, batch_ids, version_sources


def load_dimension_values(cur):
    cur.execute(
        """
        SELECT dt.name, dv.name, dv.id, dt.id, dv.is_aggregate
        FROM dimension_value dv
        JOIN dimension_type dt ON dt.id = dv.dimension_type_id
        """
    )
    return {(type_name, value_name): (value_id, type_id, aggregate) for type_name, value_name, value_id, type_id, aggregate in cur.fetchall()}


def add_observations(cur, csv_path, registry, area_ids, metadata, indicator_ids, batch_ids):
    dimensions = load_dimension_values(cur)
    cur.execute("SELECT text, id FROM note_type")
    notes = dict(cur.fetchall())

    observations = []
    observation_dimensions = []
    observation_notes = []
    area_type_counts = {}

    with open(csv_path, newline="", encoding="utf-8-sig") as source:
        for row in csv.DictReader(source):
            fingertips_id = row["Indicator ID"]
            area_code = row["Area Code"]
            if int(fingertips_id) not in INDICATOR_CONFIG or area_code not in registry:
                continue

            observation_id = uuid7()
            from_date, to_date = parse_period(row["Time period"])
            published_at = metadata[fingertips_id]["DataChange"]["LastUploadedAt"]
            count = number(row["Count"])
            numerator = None
            if count_is_numerator(
                value_type_id(metadata[fingertips_id]["ValueType"]["Name"]), fingertips_id
            ):
                count, numerator = None, count

            dimension_names = {}
            if row["Sex"] and row["Sex"] != "Persons":
                dimension_names["Sex"] = row["Sex"]
            if row["Age"]:
                dimension_names["Age"] = row["Age"]
            if row["Category Type"] and row["Category"]:
                dimension_names[row["Category Type"].strip()] = row["Category"]

            value_ids = []
            for type_name, value_name in dimension_names.items():
                key = (type_name, value_name)
                if key not in dimensions:
                    raise ValueError(f"Missing dimension value: {key}")
                value_id, type_id, aggregate = dimensions[key]
                if aggregate:
                    continue
                value_ids.append(str(value_id))
                observation_dimensions.append((uuid7(), observation_id, value_id, type_id))

            observations.append(
                (
                    observation_id,
                    indicator_ids[fingertips_id],
                    area_ids[area_code],
                    from_date,
                    to_date,
                    number(row["Value"]),
                    count,
                    numerator,
                    number(row["Denominator"]),
                    number(row["Lower CI 95.0 limit"]),
                    number(row["Upper CI 95.0 limit"]),
                    number(row["Lower CI 99.8 limit"]),
                    number(row["Upper CI 99.8 limit"]),
                    published_at,
                    batch_ids[fingertips_id],
                    # dimensionKey in @fphd/db: the dimension value ids sorted and joined.
                    ",".join(sorted(value_ids)),
                    published_at,
                )
            )

            if row["Value note"]:
                if row["Value note"] not in notes:
                    raise ValueError(f"Missing note type: {row['Value note']}")
                observation_notes.append((uuid7(), observation_id, notes[row["Value note"]]))

            source_type = registry[area_code]["area_type"]
            area_type_counts[source_type] = area_type_counts.get(source_type, 0) + 1

    execute_values(
        cur,
        """
        INSERT INTO observation
          (id, indicator_id, area_id, from_date, to_date, value, count, numerator, denominator,
           lower_ci_95, upper_ci_95, lower_ci_998, upper_ci_998, published_at,
           upload_batch_id, dimension_key, created_at)
        VALUES %s
        """,
        observations,
        page_size=5000,
    )
    execute_values(
        cur,
        """
        INSERT INTO observation_dimension
          (id, observation_id, dimension_value_id, dimension_type_id)
        VALUES %s
        """,
        observation_dimensions,
        page_size=5000,
    )
    if observation_notes:
        execute_values(
            cur,
            """
            INSERT INTO observation_note (id, observation_id, note_type_id)
            VALUES %s
            """,
            observation_notes,
            page_size=5000,
        )
    return len(observations), len(observation_dimensions), len(observation_notes), area_type_counts


def validate(cur):
    cur.execute(
        """
        SELECT i.short_id, count(o.id), count(DISTINCT a.code),
               count(DISTINCT at.name)
        FROM indicator i
        JOIN observation o ON o.indicator_id = i.id
        JOIN area a ON a.id = o.area_id
        JOIN area_type at ON at.id = a.area_type_id
        WHERE i.short_id = ANY(%s)
        GROUP BY i.short_id
        ORDER BY i.short_id
        """,
        (list(INDICATOR_CONFIG),),
    )
    rows = cur.fetchall()
    if [row[0] for row in rows] != sorted(INDICATOR_CONFIG):
        raise ValueError(f"Not every prototype indicator has observations: {rows}")
    if any(row[1] == 0 or row[2] <= 1 or row[3] <= 1 for row in rows):
        raise ValueError(f"Prototype indicator coverage is too narrow: {rows}")
    return rows


def export_tables(conn, seed_dir, out_dir, new_version_sources):
    out_dir.mkdir(parents=True, exist_ok=True)
    with conn.cursor() as cur:
        # The versions' legacy source ids live in the seed CSV alone, so the export joins them back.
        cur.execute(
            "CREATE TEMP TABLE legacy_version_source "
            "(id uuid PRIMARY KEY, numerator_source_id uuid, denominator_source_id uuid)"
        )
        legacy = {**version_legacy_sources(seed_dir), **new_version_sources}
        execute_values(
            cur,
            "INSERT INTO legacy_version_source VALUES %s",
            [(version_id, *sources) for version_id, sources in legacy.items()],
        )
        for table in EXPORT_TABLES:
            source_path = seed_dir / f"{table}.csv.gz"
            with gzip.open(source_path, "rt", newline="") as source:
                columns = next(csv.reader(source))
            # The table has no created_by for observations: the batch's uploader is the writer.
            if table == "observation":
                columns = [column for column in columns if column != "created_by"]
            if table == "indicator_version":
                selected = ", ".join(
                    f'l."{column}"' if column in LEGACY_COLUMNS else f't."{column}"'
                    for column in columns
                )
                relation = f'"{table}" t LEFT JOIN legacy_version_source l ON l.id = t.id'
            else:
                selected = ", ".join(f'"{column}"' for column in columns)
                relation = f'"{table}" t'
            query = f"COPY (SELECT {selected} FROM {relation} ORDER BY t.id) TO STDOUT WITH CSV HEADER"

            target_path = out_dir / f"{table}.csv.gz"
            with gzip.open(target_path, "wt", newline="", encoding="utf-8") as target:
                cur.copy_expert(query, target)
            cur.execute(f'SELECT count(*) FROM "{table}"')
            print(f"exported {table}: {cur.fetchone()[0]} rows")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-csv", required=True, type=Path)
    parser.add_argument("--metadata-json", required=True, type=Path)
    parser.add_argument("--area-types-json", required=True, type=Path)
    parser.add_argument("--area-dir", required=True, type=Path)
    parser.add_argument("--out-dir", required=True, type=Path)
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[5]
    seed_dir = Path(__file__).resolve().parent.parent
    with open(args.metadata_json, encoding="utf-8") as source:
        metadata = json.load(source)
    registry = load_area_registry(args.area_dir, args.area_types_json)

    conn = connect(repo_root)
    try:
        with conn:
            with conn.cursor() as cur:
                add_imd_dimension(cur)
                area_ids, added_areas = add_areas(cur, registry)
                indicator_ids, batch_ids, version_sources = add_indicators(
                    cur, metadata, seed_dir
                )
                observation_counts = add_observations(
                    cur,
                    args.data_csv,
                    registry,
                    area_ids,
                    metadata,
                    indicator_ids,
                    batch_ids,
                )
                coverage = validate(cur)
                print(f"added areas: {added_areas}")
                print(
                    "added observations/dimensions/notes: "
                    f"{observation_counts[0]}/{observation_counts[1]}/{observation_counts[2]}"
                )
                print(f"area type observation counts: {observation_counts[3]}")
                print(f"indicator coverage: {coverage}")
        export_tables(conn, seed_dir, args.out_dir, version_sources)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
