"""Build area_category.csv.gz: local authorities' IMD2025 and IMD2019 deciles.

Fingertips profile 19 supplies County & UA and District & UA memberships on April 2023
geography. Resolve the deciles through the committed dimension catalogs so the export
and uploaded observations use the same ids.

    python3 export-area-categories.py

Responses are cached in this worktree's node_modules/.cache/area-categories. Remove
that directory before refreshing from Fingertips. The export updates manifest.json.
"""

import csv
import gzip
import hashlib
import io
import json
import urllib.request
from pathlib import Path

API = "https://fingertips.phe.org.uk/api"
HERE = Path(__file__).resolve().parent
CACHE = HERE.parents[3] / "node_modules/.cache/area-categories"
CATEGORIES = [
    (502, 170, "County & UA", "IMD2025"),
    (502, 160, "County & UA", "IMD2019"),
    (501, 173, "District & UA", "IMD2025"),
    (501, 163, "District & UA", "IMD2019"),
]


def fetch(path):
    cache = CACHE / f"{hashlib.sha256(path.encode()).hexdigest()}.json"
    if cache.exists():
        return json.loads(cache.read_text())
    with urllib.request.urlopen(f"{API}/{path}", timeout=60) as response:
        data = json.load(response)
    CACHE.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(data))
    return data


def category_rows():
    types = json.loads((HERE.parent / "dimension-types.json").read_text())
    values = json.loads((HERE.parent / "dimension-values.json").read_text())
    rows = []
    for area_type, category_type, tier, scheme in CATEGORIES:
        name = f"{tier} deprivation deciles in England ({scheme}, 4/23 geography)"
        matches = [t for t in types if t["name"] == name]
        if len(matches) != 1:
            raise ValueError(f"Expected one dimension type for {name}")
        deciles = {}
        for decile in range(1, 11):
            matches_for_code = [v for v in values if v["dimensionTypeId"] == matches[0]["id"] and v["code"] == str(decile)]
            if len(matches_for_code) != 1:
                raise ValueError(f"Expected one dimension value for {name}, decile {decile}")
            deciles[decile] = matches_for_code[0]["id"]
        membership = fetch(f"area_categories?profile_id=19&child_area_type_id={area_type}&category_type_id={category_type}")
        if not isinstance(membership, dict) or not membership:
            raise ValueError(f"No area categories returned for {name}")
        for code, decile in sorted(membership.items()):
            if type(decile) is not int or decile not in deciles:
                raise ValueError(f"Invalid decile for {code}: {decile}")
            rows.append((code, deciles[decile]))
    return sorted(rows)


def main():
    rows = category_rows()
    with gzip.open(HERE / "area.csv.gz", "rt", newline="") as file:
        current = {}
        for row in csv.DictReader(file):
            if row["is_current"] == "t":
                current[row["code"]] = current.get(row["code"], 0) + 1
    missing = sorted({code for code, _ in rows if current.get(code) != 1})
    if missing:
        raise ValueError(f"Codes without exactly one current area: {', '.join(missing)}")

    buffer = io.StringIO()
    writer = csv.writer(buffer, quoting=csv.QUOTE_ALL, lineterminator="\n")
    writer.writerow(["area_code", "dimension_value_id"])
    writer.writerows(rows)
    data = gzip.compress(buffer.getvalue().encode(), mtime=0)
    (HERE / "area_category.csv.gz").write_bytes(data)
    entry = {
        "file": "area_category.csv.gz",
        "source": "Fingertips API, profile 19, area categories 170, 160, 173, 163: IMD2025 and IMD2019 deciles, upper and lower tier local authorities (April 2023 geography)",
        "rows": len(rows),
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
    }
    manifest_path = HERE / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    manifest["files"]["area_category"] = entry
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps(entry))


if __name__ == "__main__":
    main()
