"""Regression checks for the published CSV's NULL encoding."""

import csv
import gzip
import hashlib
import io
import json
import runpy
import tempfile
import unittest
from pathlib import Path


transform = runpy.run_path(str(Path(__file__).with_name("transform-uuids.py")))
strip_metadata = runpy.run_path(str(Path(__file__).with_name("strip-metadata-html.py")))
enrich_area = runpy.run_path(str(Path(__file__).with_name("enrich-area-display.py")))


class PublishedCsvTest(unittest.TestCase):
    def test_writes_null_and_empty_string_differently(self):
        output = io.StringIO()
        transform["write_published_row"](
            output,
            [transform["NULL_MARKER"], "", 'a,"b"', "line\nbreak"],
            final=True,
        )

        self.assertEqual(output.getvalue(), ',"","a,""b""","line\nbreak"\r\n')

    def test_metadata_cleanup_preserves_empty_string_and_null(self):
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, "source-manifest.json").write_text(
                json.dumps({"source_csv_null": transform["NULL_MARKER"]})
            )
            path = Path(directory, "indicator_version.csv.gz")
            with gzip.open(path, "wt", newline="") as output:
                output.write(
                    'id,definition,caveats\r\n'
                    f'1,{transform["NULL_MARKER"]},""\r\n'
                )

            strip_metadata["strip_file"](str(path))

            with gzip.open(path, "rt", newline="") as result:
                text = result.read()
            self.assertIn(
                f'"1",{transform["NULL_MARKER"]},""\r\n', text
            )
            row = next(csv.reader(io.StringIO(text.split("\r\n", 1)[1])))
            final = io.StringIO()
            transform["write_published_row"](final, row, final=True)
            self.assertEqual(final.getvalue(), '"1",,""\r\n')

    def test_area_enrichment_keeps_unmapped_group_null(self):
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, "source-manifest.json").write_text(
                json.dumps({"source_csv_null": transform["NULL_MARKER"]})
            )
            path = Path(directory, "area_type.csv.gz")
            with gzip.open(path, "wt", newline="") as output:
                output.write("id,name,hierarchy_type\r\n1,Other,Administrative\r\n")

            enrich_area["enrich_area_types"](str(path))

            with gzip.open(path, "rt", newline="") as result:
                self.assertIn(
                    f'"1","Other","Administrative",{transform["NULL_MARKER"]},{transform["NULL_MARKER"]}\r\n',
                    result.read(),
                )

    def test_cleanup_and_deterministic_transform_preserve_both_values(self):
        with tempfile.TemporaryDirectory() as directory:
            tables = {table: {"rows": 1} for table in transform["PUBLISHED_TABLES"]}
            Path(directory, "source-manifest.json").write_text(
                json.dumps(
                    {
                        "source": "PHOLIO_LIVE_A-derived fphd_new benchmark clone",
                        "source_csv_null": transform["NULL_MARKER"],
                        "tables": tables,
                    }
                )
            )
            for table in transform["PUBLISHED_TABLES"]:
                foreign_keys = list(transform["FOREIGN_KEYS"].get(table, {}))
                if table == "indicator":
                    foreign_keys = []
                bridge = table in transform["BRIDGE_TABLES"]
                header = [*([] if bridge else ["id"]), *foreign_keys]
                row = ["1"] * len(header)
                if table == "indicator_version":
                    header.extend(["definition", "caveats"])
                    row.extend([transform["NULL_MARKER"], ""])
                with gzip.open(Path(directory, f"{table}.csv.gz"), "wt", newline="") as output:
                    csv.writer(output).writerow(header)
                    transform["write_published_row"](output, row)

            strip_metadata["strip_file"](str(Path(directory, "indicator_version.csv.gz")))
            transform["main"](directory, deterministic=True)

            with gzip.open(
                Path(directory, "indicator_version.csv.gz"), "rt", newline=""
            ) as result:
                self.assertTrue(result.read().endswith(',,""\r\n'))


class SeedGeographyTest(unittest.TestCase):
    def test_regeneration_uses_explicit_status_and_dates_from_core_geography(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            geography = root / "geography"
            geography.mkdir()
            source = geography / "area.csv.gz"
            with gzip.open(source, "wt", newline="") as output:
                output.write("code,valid_from,valid_to,is_current\nA,,,f\nB,,,t\n")
            (geography / "manifest.json").write_text(json.dumps({"files": {"area": {
                "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
            }}}))
            seed = root / "area.csv.gz"
            with gzip.open(seed, "wt", newline="") as output:
                output.write("id,code,name,area_type_id,valid_from,valid_to\n")
                output.write("1,A,Retired,6,2000-01-01,\n2,B,Current,6,2000-01-01,2020-01-01\n")
            enrich_area["refresh_area_status"](str(seed), geography)
            with gzip.open(seed, "rt", newline="") as result:
                rows = list(csv.DictReader(result))
            self.assertEqual([row["is_current"] for row in rows], ["f", "t"])
            self.assertTrue(all(row["valid_from"] == row["valid_to"] == "" for row in rows))
            before = seed.read_bytes()
            with gzip.open(source, "wt", newline="") as output:
                output.write("code,valid_from,valid_to,is_current\nB,,,t\n")
            (geography / "manifest.json").write_text(json.dumps({"files": {"area": {
                "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
            }}}))
            with self.assertRaisesRegex(ValueError, "No core geography for seed area A"):
                enrich_area["refresh_area_status"](str(seed), geography)
            self.assertEqual(seed.read_bytes(), before)


class ForeignKeyIndexesTest(unittest.TestCase):
    def test_maps_each_foreign_key_column_to_its_table(self):
        self.assertEqual(
            transform["foreign_key_indexes"](
                "observation_note", ["note_type_id", "observation_id"]
            ),
            {0: "note_type", 1: "observation"},
        )

    def test_allows_the_identity_only_indicator_row(self):
        self.assertEqual(transform["foreign_key_indexes"]("indicator", ["id", "created_at"]), {})

    def test_refuses_an_indicator_row_missing_only_some_foreign_keys(self):
        with self.assertRaises(ValueError) as raised:
            transform["foreign_key_indexes"]("indicator", ["id", "value_type_id"])

        self.assertIn("unit_id", str(raised.exception))

    def test_refuses_any_other_table_missing_a_foreign_key(self):
        with self.assertRaises(ValueError) as raised:
            transform["foreign_key_indexes"]("observation_note", ["observation_id"])

        self.assertIn("note_type_id", str(raised.exception))


class ActorTest(unittest.TestCase):
    def test_finds_the_writer_columns(self):
        self.assertEqual(
            transform["actor_indexes"]("upload_batch", ["id", "uploaded_by", "status"]), [1]
        )

    def test_finds_none_on_the_identity_only_indicator_row(self):
        self.assertEqual(transform["actor_indexes"]("indicator", ["id", "created_at"]), [])

    def test_leaves_the_observation_writer_alone(self):
        self.assertEqual(transform["actor_indexes"]("observation", ["id", "created_by"]), [])

    def test_turns_the_pholio_migration_into_its_system_user(self):
        self.assertEqual(
            transform["actor_user_id"]("indicator", "pholio-migration"),
            "01a13c69-96ab-7598-9ce0-f0c3bd77bded",
        )

    def test_refuses_a_writer_no_user_stands_for(self):
        with self.assertRaises(ValueError) as raised:
            transform["actor_user_id"]("upload_batch", "someone")

        self.assertEqual(str(raised.exception), "upload_batch names a writer with no user: someone")


if __name__ == "__main__":
    unittest.main()
