"""Build area_neighbour.csv.gz: each upper tier local authority's NHS England peer group.

Fingertips serves the ranked lists Pholio holds in L_AreaCodeNeighbourMapping. Its upper tier
local authorities (area type 502) use neighbour type 15, the 2024 NHS England peer groups
(https://github.com/NHSDigital/ASC_LA_Peer_Groups): 15 neighbours each. Pholio stores only
the ranking, so that is all this carries.

    python3 export-area-neighbours.py

Rows reference the current area of each code in area.csv.gz, so run it after that file
changes, then update manifest.json with the printed rows, bytes and sha256.
"""

import csv
import gzip
import hashlib
import io
import json
import sys
import urllib.request
from pathlib import Path

API = "https://fingertips.phe.org.uk/api"
AREA_TYPE = 502
NEIGHBOUR_TYPE = 15
SCHEME = "NHS England peer groups (2024)"
# The next tag after the seed export's tables (transform-uuids.py), so ids never collide.
TABLE_TAG = 22
HERE = Path(__file__).parent


def fetch(path):
    with urllib.request.urlopen(f"{API}/{path}", timeout=60) as response:
        return json.load(response)


def deterministic_uuid7(code, position):
    timestamp_ms = 1777593600000
    key = f"{code}\0{SCHEME}\0{position}".encode()
    suffix = int.from_bytes(hashlib.sha256(key).digest()[:8], "big") & ((1 << 62) - 1)
    value = (timestamp_ms << 80) | (0x7 << 76) | (TABLE_TAG << 64) | (0x2 << 62) | suffix
    hexed = f"{value:032x}"
    return f"{hexed[:8]}-{hexed[8:12]}-{hexed[12:16]}-{hexed[16:20]}-{hexed[20:]}"


def current_areas():
    ids = {}
    with gzip.open(HERE / "area.csv.gz", "rt", newline="") as file:
        for row in csv.DictReader(file):
            if row["is_current"] == "t":
                ids.setdefault(row["code"], []).append(row["id"])
    return ids


def neighbour_rows():
    rows = []
    for area in sorted(fetch(f"areas/by_area_type?area_type_id={AREA_TYPE}"), key=lambda a: a["Code"]):
        detail = fetch(f"areas/nearest_neighbours?area_type_id={AREA_TYPE}&area_code={area['Code']}")
        groups = [g for g in detail["NeighbourAreaDet"] if g["NeighbourTypeId"] == NEIGHBOUR_TYPE]
        if len(groups) != 1:
            raise ValueError(f"Expected one neighbour-type-{NEIGHBOUR_TYPE} group for {area['Code']}")
        neighbours = sorted(groups[0]["NeighbourAreas"], key=lambda n: n["Position"])
        if ([n["Position"] for n in neighbours] != list(range(1, 16))
                or len({n["AreaCode"] for n in neighbours}) != 15):
            raise ValueError(f"Expected 15 ranked neighbours for {area['Code']}")
        rows.extend((area["Code"], n["AreaCode"], n["Position"]) for n in neighbours)
    if not rows:
        raise ValueError("No upper tier local authorities returned")
    return rows


def main():
    ids = current_areas()
    rows = neighbour_rows()

    missing = sorted({code for row in rows for code in row[:2] if len(ids.get(code, [])) != 1})
    if missing:
        sys.exit(f"Codes without exactly one current area: {', '.join(missing)}")

    buffer = io.StringIO()
    writer = csv.writer(buffer, quoting=csv.QUOTE_ALL, lineterminator="\n")
    writer.writerow(["id", "area_id", "neighbour_area_id", "scheme", "position"])
    for code, neighbour, position in rows:
        writer.writerow([deterministic_uuid7(code, position), ids[code][0], ids[neighbour][0], SCHEME, position])
    data = gzip.compress(buffer.getvalue().encode(), mtime=0)
    (HERE / "area_neighbour.csv.gz").write_bytes(data)
    areas = len({row[0] for row in rows})
    print(json.dumps({"areas": areas, "rows": len(rows), "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}))


if __name__ == "__main__":
    main()
