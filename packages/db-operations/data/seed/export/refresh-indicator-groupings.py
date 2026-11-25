#!/usr/bin/env python3
"""Fingertips groupings keep selector fixtures faithful to published sex/age pairs."""

import csv
import gzip
import io
import json
import re
import sys
from pathlib import Path
from urllib.request import urlopen
from uuid import NAMESPACE_URL, uuid5


INDICATORS = (108, 92443, 93622)
COLUMNS = ("id", "indicator_id", "sex_id", "age_id", "year_range", "period_kind")
API_URL = "https://fingertips.phe.org.uk/api/grouproot_summaries/by_indicator_id"


def read_rows(directory, table):
    with gzip.open(Path(directory, f"{table}.csv.gz"), "rt", newline="") as source:
        return list(csv.DictReader(source))


def grouping_rows(indicators, types, values, summaries):
    indicator_ids = {int(row["short_id"]): row["id"] for row in indicators}
    type_ids = {row["name"]: row["id"] for row in types}
    dimension_ids = {
        (row["dimension_type_id"], row["code"], row["name"]): row["id"] for row in values
    }

    def dimension_id(kind, source):
        if source["Id"] in ((-1, 4) if kind == "Sex" else (-1, 1)):
            return ""
        key = (type_ids[kind], str(source["Id"]), source["Name"])
        if key not in dimension_ids:
            raise ValueError(f"Unmapped {kind}: {source}")
        return dimension_ids[key]

    rows = {}
    for summary in summaries:
        short_id = summary["IID"]
        if short_id not in INDICATORS:
            continue
        # These fixtures cover annual periods; accepting a quarter or month as annual would hide data.
        if not re.fullmatch(r"\d{4}(?:/\d{2}|\s*-\s*\d{2,4})?", summary["TimePeriod"]):
            raise ValueError(f"Non-annual grouping for {short_id}: {summary['TimePeriod']}")
        sex_id = dimension_id("Sex", summary["Sex"])
        age_id = dimension_id("Age", summary["Age"])
        year_range = summary["YearRange"]
        if not isinstance(year_range, int) or year_range < 1:
            raise ValueError(f"Invalid year range for {short_id}: {year_range}")
        key = (short_id, sex_id, age_id, year_range)
        rows[key] = {
            "id": str(uuid5(NAMESPACE_URL, f"fphd:seed:indicator_grouping:{key}:annual")),
            "indicator_id": indicator_ids[short_id],
            "sex_id": sex_id,
            "age_id": age_id,
            "year_range": year_range,
            "period_kind": "annual",
        }
    missing = set(INDICATORS) - {key[0] for key in rows}
    if missing:
        raise ValueError(f"Missing published groupings for {sorted(missing)}")
    return [rows[key] for key in sorted(rows)]


def refresh(directory):
    with urlopen(f"{API_URL}?indicator_ids={','.join(map(str, INDICATORS))}", timeout=60) as response:
        summaries = json.load(response)
    indicators = read_rows(directory, "indicator")
    rows = grouping_rows(
        indicators,
        read_rows(directory, "dimension_type"),
        read_rows(directory, "dimension_value"),
        summaries,
    )
    path = Path(directory, "indicator_grouping.csv.gz")
    if path.exists():
        refreshed_ids = {row["id"] for row in indicators if int(row["short_id"]) in INDICATORS}
        rows = [
            row for row in read_rows(directory, "indicator_grouping")
            if row["indicator_id"] not in refreshed_ids
        ] + rows
    output = io.StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=COLUMNS)
    writer.writeheader()
    writer.writerows(rows)
    temporary = path.with_suffix(".gz.tmp")
    temporary.write_bytes(gzip.compress(output.getvalue().encode(), mtime=0))
    temporary.replace(path)
    print(f"indicator_grouping: {len(rows)} rows -> {path}")


if __name__ == "__main__":
    refresh(sys.argv[1])
