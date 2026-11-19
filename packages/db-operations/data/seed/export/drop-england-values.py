#!/usr/bin/env python3
"""Drop England's observations from the indicators the seed publishes without an England value.

Run locally after split-count-and-numerator.py:

    python3 drop-england-values.py ..

Some live indicators have values for areas but none for England. The seed gives air pollution
(93861) that shape, so the e2e suite covers an indicator page with no England value. Each dropped
observation's dimension and note rows go with it. Running it again drops nothing more.
"""

import csv
import gzip
import os
import sys

ENGLAND_CODE = "E92000001"
WITHOUT_ENGLAND = {"93861"}


def read_rows(path):
    with gzip.open(path, "rt", newline="") as f:
        return list(csv.DictReader(f))


def rewrite(path, keep):
    tmp = f"{path}.tmp"
    with gzip.open(path, "rt", newline="") as source, gzip.open(tmp, "wt", newline="") as target:
        reader = csv.DictReader(source)
        writer = csv.DictWriter(target, fieldnames=list(reader.fieldnames or []))
        writer.writeheader()
        for row in reader:
            if keep(row):
                writer.writerow(row)
    os.replace(tmp, path)


def main(seed_dir):
    england_ids = {
        row["id"]
        for row in read_rows(os.path.join(seed_dir, "area.csv.gz"))
        if row["code"] == ENGLAND_CODE
    }
    indicator_ids = {
        row["id"]
        for row in read_rows(os.path.join(seed_dir, "indicator.csv.gz"))
        if row["short_id"] in WITHOUT_ENGLAND
    }
    if len(indicator_ids) != len(WITHOUT_ENGLAND):
        raise ValueError(f"The seed does not hold every indicator in {sorted(WITHOUT_ENGLAND)}")

    observations = os.path.join(seed_dir, "observation.csv.gz")
    dropped = {
        row["id"]
        for row in read_rows(observations)
        if row["indicator_id"] in indicator_ids and row["area_id"] in england_ids
    }
    rewrite(observations, lambda row: row["id"] not in dropped)
    for table in ("observation_dimension", "observation_note"):
        rewrite(
            os.path.join(seed_dir, f"{table}.csv.gz"),
            lambda row: row["observation_id"] not in dropped,
        )


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else ".")
