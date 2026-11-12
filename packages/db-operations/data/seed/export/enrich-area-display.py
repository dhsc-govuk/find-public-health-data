"""Stamp display groups onto area_type.csv.gz and strip level suffixes from area.csv.gz.

The Pholio source carries neither: which types roll into which user-facing level is a
service-side decision, and Pholio area names embed their level ("London region
(statistical)") where the service stores the bare name and lets the level carry that
context. Run after export-seed.py / transform-uuids.py, before committing the CSVs.
"""

import csv
import gzip
import hashlib
import io
import json
import re
import sys
from pathlib import Path

from published_csv import published_null_marker, write_published_row

DISPLAY_GROUPS = {
    "County unchanged": ("Local authorities", 1),
    "LA unchanged": ("Local authorities", 1),
    "UA unchanged": ("Local authorities", 1),
    "UA new 2020": ("Local authorities", 1),
    "UA new 2021": ("Local authorities", 1),
    "UA new 2023": ("Local authorities", 1),
    "Regions (statistical)": ("Statistical regions", 2),
    "NHS regions": ("NHS regions", 3),
    "ICBs": ("Integrated care boards", 4),
    "MSOA": ("Middle-layer super output areas", 5),
    "GPs": ("GP practices", 6),
}


def strip_name(name: str) -> str:
    name = re.sub(r" region \(statistical\)$", "", name)
    name = re.sub(r" NHS Region$", "", name)
    name = re.sub(r"^NHS (.+) Integrated Care Board - \w+$", r"\1", name)
    name = re.sub(r" UA$", "", name)
    return name


def enrich_area_types(path: str) -> None:
    null_marker = published_null_marker(Path(path).parent)
    with gzip.open(path, "rt") as f:
        rows = list(csv.DictReader(f))
    for row in rows:
        group, order = DISPLAY_GROUPS.get(
            row["name"], (null_marker, null_marker) if null_marker else ("", "")
        )
        row["display_group"], row["display_order"] = group, order
    buf = io.StringIO()
    fieldnames = ["id", "name", "hierarchy_type", "display_group", "display_order"]
    if null_marker:
        csv.writer(buf).writerow(fieldnames)
        for row in rows:
            write_published_row(buf, [row[field] for field in fieldnames])
    else:
        writer = csv.DictWriter(buf, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    with gzip.open(path, "wt", newline="") as f:
        f.write(buf.getvalue())
    grouped = sum(1 for row in rows if row["display_group"] not in ("", null_marker))
    print(f"{path}: {grouped} of {len(rows)} types grouped")


def strip_area_names(path: str) -> None:
    null_marker = published_null_marker(Path(path).parent)
    with gzip.open(path, "rt") as f:
        reader = csv.reader(f)
        header = next(reader)
        rows = list(reader)
    name_index = header.index("name")
    changed = 0
    for row in rows:
        stripped = strip_name(row[name_index])
        if stripped != row[name_index]:
            row[name_index] = stripped
            changed += 1
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(header)
    if null_marker:
        for row in rows:
            write_published_row(buf, row)
    else:
        writer.writerows(rows)
    with gzip.open(path, "wt", newline="") as f:
        f.write(buf.getvalue())
    print(f"{path}: {changed} of {len(rows)} names stripped")


def refresh_area_status(path: str, geography_directory=None) -> None:
    geography = Path(geography_directory or Path(__file__).resolve().parents[2] / "geography")
    manifest = json.loads((geography / "manifest.json").read_text())["files"]["area"]
    source = geography / "area.csv.gz"
    if hashlib.sha256(source.read_bytes()).hexdigest() != manifest["sha256"]:
        raise ValueError("Core geography integrity check failed for area")
    with gzip.open(source, "rt", newline="") as handle:
        source_rows = list(csv.DictReader(handle))
    by_code = {row["code"]: row for row in source_rows}
    if len(by_code) != len(source_rows):
        raise ValueError("Core geography contains ambiguous area codes")
    with gzip.open(path, "rt", newline="") as handle:
        reader = csv.DictReader(handle)
        header = list(reader.fieldnames)
        rows = list(reader)
    if "is_current" not in header:
        header.append("is_current")
    null_marker = published_null_marker(Path(path).parent)
    for row in rows:
        reference = by_code.get(row["code"])
        if reference is None:
            raise ValueError(f"No core geography for seed area {row['code']}")
        if reference["is_current"] not in ("t", "f"):
            raise ValueError(f"Missing core current status for seed area {row['code']}")
        row["is_current"] = reference["is_current"]
        for field in ("valid_from", "valid_to"):
            row[field] = reference[field] or null_marker or ""
    temporary = f"{path}.tmp"
    with gzip.open(temporary, "wt", newline="") as handle:
        csv.writer(handle).writerow(header)
        for row in rows:
            if null_marker:
                write_published_row(handle, [row[field] for field in header])
            else:
                csv.writer(handle).writerow([row[field] for field in header])
    Path(temporary).replace(path)
    print(f"{path}: {len(rows)} areas matched to core geography")


if __name__ == "__main__":
    directory = sys.argv[1] if len(sys.argv) > 1 else "."
    enrich_area_types(f"{directory}/area_type.csv.gz")
    refresh_area_status(f"{directory}/area.csv.gz")
    strip_area_names(f"{directory}/area.csv.gz")
