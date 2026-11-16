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


def deterministic_uuid7(numeric_id):
    timestamp_ms = 1777593600000
    value = (timestamp_ms << 80) | (0x7 << 76) | (TABLE_TAG << 64) | (0x2 << 62) | (2 * numeric_id)
    hexed = f"{value:032x}"
    return f"{hexed[:8]}-{hexed[8:12]}-{hexed[12:16]}-{hexed[16:20]}-{hexed[20:]}"


def current_areas():
    ids = {}
    with gzip.open(HERE / "area.csv.gz", "rt", newline="") as file:
        for row in csv.DictReader(file):
            if row["is_current"] == "t":
                ids.setdefault(row["code"], []).append(row["id"])
    return ids


def main():
    ids = current_areas()
    rows = []
    for area in sorted(fetch(f"areas/by_area_type?area_type_id={AREA_TYPE}"), key=lambda a: a["Code"]):
        detail = fetch(f"areas/nearest_neighbours?area_type_id={AREA_TYPE}&area_code={area['Code']}")
        groups = [g for g in detail["NeighbourAreaDet"] if g["NeighbourTypeId"] == NEIGHBOUR_TYPE]
        for group in groups:
            for neighbour in sorted(group["NeighbourAreas"], key=lambda n: n["Position"]):
                rows.append((area["Code"], neighbour["AreaCode"], neighbour["Position"]))

    missing = sorted({code for row in rows for code in row[:2] if len(ids.get(code, [])) != 1})
    if missing:
        sys.exit(f"Codes without exactly one current area: {', '.join(missing)}")

    buffer = io.StringIO()
    writer = csv.writer(buffer, quoting=csv.QUOTE_ALL, lineterminator="\n")
    writer.writerow(["id", "area_id", "neighbour_area_id", "scheme", "position"])
    for index, (code, neighbour, position) in enumerate(rows, start=1):
        writer.writerow([deterministic_uuid7(index), ids[code][0], ids[neighbour][0], SCHEME, position])
    data = gzip.compress(buffer.getvalue().encode(), mtime=0)
    (HERE / "area_neighbour.csv.gz").write_bytes(data)
    areas = len({row[0] for row in rows})
    print(json.dumps({"areas": areas, "rows": len(rows), "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}))


if __name__ == "__main__":
    main()
