#!/usr/bin/env python3
"""Tidy the whitespace in dimension type, dimension value and note type names.

Uploaded data is matched to these names with whitespace tidied (trimmed, each run of
whitespace one space), so every name is stored in that form and no two may match once
tidied. Rows whose names differ only in whitespace merge into the one with the lowest id,
and the rows pointing at them follow. A dimension type merges only when its class and
whether it is required agree and each of its values has a namesake in the survivor, and
note types only when their categories agree; anything else stops the run with the names
listed. tidyName in @fphd/utils and the tidy-reference-names migration hold the same rule.

Run after export-seed.py / transform-uuids.py, or on an integer-keyed source snapshot and
before transform-uuids.py, whose row-count check reads the source-manifest.json entries
this step rewrites for the files it changes. It marks source-manifest.json as tidied, which
the transform carries into manifest.json, and refuses an archive the transform has rekeyed:

    python3 tidy-reference-names.py /tmp/published-out
"""

import csv
import gzip
import hashlib
import json
import os
import re
import sys
from pathlib import Path

from published_csv import published_null_marker, write_published_row

# JavaScript's \s, as tidyName in @fphd/utils writes it out.
WHITESPACE = re.compile(
    "[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+"
)


def tidy(name):
    return WHITESPACE.sub(" ", name).strip(" ")


def id_order(id):
    """Lowest first: numerically for the export's integer keys, as text for UUIDv7."""
    return int(id) if id.lstrip("-").isdigit() else id


def survivors(rows, key):
    """Map each row's id to the lowest id among the rows sharing its tidied key."""
    lowest = {}
    for row in rows:
        group = key(row)
        if group not in lowest or id_order(row["id"]) < id_order(lowest[group]):
            lowest[group] = row["id"]
    return {row["id"]: lowest[key(row)] for row in rows}


def refuse_mixed(rows, key, fields, problem):
    """Stop if rows sharing a tidied key differ in any of `fields`."""
    found = {}
    for row in rows:
        found.setdefault(key(row), set()).add(tuple(row[field] for field in fields))
    mixed = sorted(name for name, kinds in found.items() if len(kinds) > 1)
    if mixed:
        raise ValueError(f"{problem}: " + ", ".join(mixed))


def type_merges(types):
    refuse_mixed(
        types,
        lambda row: tidy(row["name"]),
        ["dimension_class", "is_required"],
        "Dimension types differing only in whitespace have different classes or requirements",
    )
    return survivors(types, lambda row: tidy(row["name"]))


def value_merges(values, type_survivor):
    """Map each value's id to the survivor type's value of the same tidied name."""
    by_name = {}
    clashes = []
    for row in values:
        key = (row["dimension_type_id"], tidy(row["name"]))
        if key in by_name:
            clashes.append(key[1])
        by_name[key] = row["id"]
    if clashes:
        raise ValueError(
            "Values of one dimension type differ only in whitespace: "
            + ", ".join(sorted(set(clashes)))
        )
    merges = {}
    unpaired = []
    for row in values:
        survivor_type = type_survivor[row["dimension_type_id"]]
        survivor = by_name.get((survivor_type, tidy(row["name"])))
        if survivor is None:
            unpaired.append(row["name"])
        else:
            merges[row["id"]] = survivor
    if unpaired:
        raise ValueError(
            "A dimension type merging into another has values the other lacks: "
            + ", ".join(unpaired)
        )
    return merges


def note_merges(notes):
    refuse_mixed(
        notes,
        lambda row: tidy(row["text"]),
        ["category"],
        "Note types differing only in whitespace have different categories",
    )
    return survivors(notes, lambda row: tidy(row["text"]))


def line_ending(path):
    with gzip.open(path, "rb") as f:
        return "\r\n" if f.readline().endswith(b"\r\n") else "\n"


def read_table(directory, table):
    with gzip.open(Path(directory, f"{table}.csv.gz"), "rt", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        return list(reader), list(reader.fieldnames or [])


def open_writer(output, fields, null_marker, ending):
    """Write the header and return a function writing one row, as the file was written."""
    if null_marker:
        csv.writer(output).writerow(fields)
        return lambda row: write_published_row(output, [row[field] for field in fields])
    writer = csv.DictWriter(output, fieldnames=fields, lineterminator=ending)
    writer.writeheader()
    return writer.writerow


def stage(path, write):
    """Write `path`'s replacement to a .tmp beside it, returning that path and write's result.

    The .tmp is removed if writing fails; the caller moves it into place once every file is staged.
    """
    tmp = Path(f"{path}.tmp")
    try:
        with gzip.open(tmp, "wt", encoding="utf-8", newline="") as f:
            result = write(f)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise
    return tmp, result


def write_table(directory, table, fields, rows, null_marker):
    path = Path(directory, f"{table}.csv.gz")
    ending = line_ending(path)

    def write(f):
        write_row = open_writer(f, fields, null_marker, ending)
        for row in rows:
            write_row(row)
        return len(rows)

    return stage(path, write)


def read_bridge(path):
    with gzip.open(path, "rt", encoding="utf-8", newline="") as src:
        yield from csv.DictReader(src)


def rewrite_bridge(directory, table, remap, null_marker):
    """Stage a bridge table streamed through `remap`, which returns a row to keep or None to drop.

    Returns the staged path and the rows kept, or None when no row changed.
    """
    path = Path(directory, f"{table}.csv.gz")
    ending = line_ending(path)
    with gzip.open(path, "rt", encoding="utf-8", newline="") as src:
        fields = next(csv.reader(src))

    def write(dst):
        write_row = open_writer(dst, fields, null_marker, ending)
        rows = 0
        changed = False
        for row in read_bridge(path):
            kept = remap(row)
            changed = changed or kept != row
            if kept is not None:
                write_row(kept)
                rows += 1
        return rows, changed

    tmp, (rows, changed) = stage(path, write)
    if not changed:
        tmp.unlink()
        return None
    return tmp, rows


def dimension_remap(value_survivor, type_survivor):
    merged_types = {survivor for id, survivor in type_survivor.items() if id != survivor}
    seen = set()

    def remap(row):
        survivor_type = type_survivor[row["dimension_type_id"]]
        if survivor_type in merged_types:
            if (row["observation_id"], survivor_type) in seen:
                raise ValueError(
                    f"Observation {row['observation_id']} has a value in two dimension types "
                    "that merge"
                )
            seen.add((row["observation_id"], survivor_type))
        return {
            **row,
            "dimension_value_id": value_survivor[row["dimension_value_id"]],
            "dimension_type_id": survivor_type,
        }

    return remap


def note_remap(note_survivor):
    """Repoint each note at its survivor, keeping one row of an observation's repeats."""
    merged = {survivor for id, survivor in note_survivor.items() if id != survivor}
    seen = set()

    def remap(row):
        key = (row["observation_id"], note_survivor[row["note_type_id"]])
        if key[1] in merged:
            if key in seen:
                return None
            seen.add(key)
        return {**row, "note_type_id": key[1]}

    return remap


def file_entry(path, rows):
    digest = hashlib.sha256()
    with path.open("rb") as file:
        while chunk := file.read(1024 * 1024):
            digest.update(chunk)
    return {"rows": rows, "bytes": path.stat().st_size, "sha256": digest.hexdigest()}


def tidy_reference_names(directory):
    if Path(directory, "manifest.json").exists():
        raise ValueError(
            "This archive has been through transform-uuids.py; run the step on the export, "
            "before the transform"
        )
    null_marker = published_null_marker(directory)
    types, type_fields = read_table(directory, "dimension_type")
    values, value_fields = read_table(directory, "dimension_value")
    notes, note_fields = read_table(directory, "note_type")

    type_survivor = type_merges(types)
    value_survivor = value_merges(values, type_survivor)
    note_survivor = note_merges(notes)

    staged = {}
    try:
        staged["dimension_type"] = write_table(
            directory,
            "dimension_type",
            type_fields,
            [
                {**row, "name": tidy(row["name"])}
                for row in types
                if type_survivor[row["id"]] == row["id"]
            ],
            null_marker,
        )
        staged["dimension_value"] = write_table(
            directory,
            "dimension_value",
            value_fields,
            [
                {
                    **row,
                    "name": tidy(row["name"]),
                    "parent_id": value_survivor.get(row["parent_id"], row["parent_id"]),
                }
                for row in values
                if value_survivor[row["id"]] == row["id"]
            ],
            null_marker,
        )
        staged["note_type"] = write_table(
            directory,
            "note_type",
            note_fields,
            [
                {**row, "text": tidy(row["text"])}
                for row in notes
                if note_survivor[row["id"]] == row["id"]
            ],
            null_marker,
        )
        if any(id != survivor for id, survivor in value_survivor.items()):
            staged["observation_dimension"] = rewrite_bridge(
                directory,
                "observation_dimension",
                dimension_remap(value_survivor, type_survivor),
                null_marker,
            )
        if any(id != survivor for id, survivor in note_survivor.items()):
            staged["observation_note"] = rewrite_bridge(
                directory, "observation_note", note_remap(note_survivor), null_marker
            )
    except BaseException:
        for entry in staged.values():
            if entry is not None:
                entry[0].unlink(missing_ok=True)
        raise
    # Nothing is replaced until every file has staged, so a refusal leaves the archive as it was.
    counts = {}
    for table, entry in staged.items():
        if entry is not None:
            os.replace(entry[0], Path(directory, f"{table}.csv.gz"))
            counts[table] = entry[1]

    manifest_path = Path(directory, "source-manifest.json")
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text())
        for table, rows in counts.items():
            manifest["tables"][table] = file_entry(Path(directory, f"{table}.csv.gz"), rows)
        # The importer refuses an archive without this mark.
        manifest["reference_names"] = "tidied"
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")

    for table, rows in counts.items():
        print(f"{table}: {rows} rows")


if __name__ == "__main__":
    tidy_reference_names(sys.argv[1] if len(sys.argv) > 1 else ".")
