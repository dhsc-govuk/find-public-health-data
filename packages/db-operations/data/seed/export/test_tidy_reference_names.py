"""Checks for tidy-reference-names.py."""

import contextlib
import csv
import gzip
import hashlib
import io
import json
import runpy
import tempfile
import unittest
from pathlib import Path

from published_csv import NULL_MARKER


step = runpy.run_path(str(Path(__file__).with_name("tidy-reference-names.py")))

TYPE_FIELDS = ["id", "name", "dimension_class", "is_required"]
VALUE_FIELDS = ["id", "dimension_type_id", "parent_id", "name"]
NOTE_FIELDS = ["id", "text", "category"]
DIMENSION_FIELDS = ["observation_id", "dimension_value_id", "dimension_type_id"]
OBSERVATION_NOTE_FIELDS = ["observation_id", "note_type_id"]


def write_table(directory, table, fields, rows, ending="\n"):
    with gzip.open(Path(directory, f"{table}.csv.gz"), "wt", newline="") as output:
        writer = csv.writer(output, lineterminator=ending)
        writer.writerow(fields)
        writer.writerows(rows)


def read_table(directory, table):
    with gzip.open(Path(directory, f"{table}.csv.gz"), "rt", newline="") as source:
        return list(csv.reader(source))[1:]


def write_seed(directory, types, values, notes, dimensions=(), observation_notes=()):
    write_table(directory, "dimension_type", TYPE_FIELDS, types)
    write_table(directory, "dimension_value", VALUE_FIELDS, values)
    write_table(directory, "note_type", NOTE_FIELDS, notes)
    write_table(directory, "observation_dimension", DIMENSION_FIELDS, dimensions)
    write_table(directory, "observation_note", OBSERVATION_NOTE_FIELDS, observation_notes)


def tidy_reference_names(directory):
    with contextlib.redirect_stdout(io.StringIO()):
        step["tidy_reference_names"](directory)


class TidyTest(unittest.TestCase):
    def test_trims_and_collapses_whitespace(self):
        self.assertEqual(step["tidy"]("GP cluster shapes "), "GP cluster shapes")
        self.assertEqual(step["tidy"]("Ethnic groups  [152]"), "Ethnic groups [152]")
        self.assertEqual(step["tidy"]("Trust and \n\tRoyal\tTrust\n"), "Trust and Royal Trust")

    def test_counts_the_same_characters_as_whitespace_as_tidy_name(self):
        self.assertEqual(step["tidy"]("\u00a0Other\u202f \ufeff"), "Other")
        self.assertEqual(step["tidy"]("Year\u00a0\u20033-6"), "Year 3-6")
        self.assertEqual(step["tidy"]("Vertical\u000btab\u000b"), "Vertical tab")
        self.assertEqual(step["tidy"]("Next line\u0085kept"), "Next line\u0085kept")
        self.assertEqual(step["tidy"]("Separator\u001ckept"), "Separator\u001ckept")


class TidyReferenceNamesTest(unittest.TestCase):
    def test_tidies_names_and_merges_a_type_into_the_lower_id(self):
        with tempfile.TemporaryDirectory() as directory:
            write_seed(
                directory,
                types=[
                    ["1", "Deciles (IMD trend)\n", "inequality", "f"],
                    ["2", "Deciles (IMD trend)", "inequality", "f"],
                    ["3", "Quintiles\u00a0", "inequality", "f"],
                ],
                values=[
                    ["10", "1", "", "Most deprived "],
                    ["11", "1", "10", "Least deprived"],
                    ["20", "2", "", "Most deprived"],
                    ["21", "2", "20", "Least deprived"],
                    ["30", "3", "20", "Most deprived"],
                ],
                notes=[["5", "Value suppressed ", "disclosure"]],
                dimensions=[["1000", "10", "1"], ["1001", "21", "2"]],
            )

            tidy_reference_names(directory)

            self.assertEqual(
                read_table(directory, "dimension_type"),
                [
                    ["1", "Deciles (IMD trend)", "inequality", "f"],
                    ["3", "Quintiles", "inequality", "f"],
                ],
            )
            self.assertEqual(
                read_table(directory, "dimension_value"),
                [
                    ["10", "1", "", "Most deprived"],
                    ["11", "1", "10", "Least deprived"],
                    ["30", "3", "10", "Most deprived"],
                ],
            )
            self.assertEqual(
                read_table(directory, "note_type"), [["5", "Value suppressed", "disclosure"]]
            )
            self.assertEqual(
                read_table(directory, "observation_dimension"),
                [["1000", "10", "1"], ["1001", "11", "1"]],
            )

    def test_keeps_each_file_line_ending(self):
        with tempfile.TemporaryDirectory() as directory:
            write_seed(directory, types=[["1", "Sex ", "core", "t"]], values=[], notes=[])
            write_table(directory, "note_type", NOTE_FIELDS, [["1", "Note ", "quality"]], "\r\n")

            tidy_reference_names(directory)

            with gzip.open(Path(directory, "dimension_type.csv.gz"), "rb") as source:
                self.assertEqual(
                    source.read(), b"id,name,dimension_class,is_required\n1,Sex,core,t\n"
                )
            with gzip.open(Path(directory, "note_type.csv.gz"), "rb") as source:
                self.assertEqual(source.read(), b"id,text,category\r\n1,Note,quality\r\n")

    def test_merges_note_types_keeping_one_note_per_observation(self):
        with tempfile.TemporaryDirectory() as directory:
            write_seed(
                directory,
                types=[],
                values=[],
                notes=[
                    ["7", "Aggregated from values for merged CCGs", "geographic"],
                    ["3", "Aggregated from values for merged CCGs", "geographic"],
                ],
                observation_notes=[["1000", "3"], ["1000", "7"], ["1001", "7"]],
            )

            tidy_reference_names(directory)

            self.assertEqual(
                read_table(directory, "note_type"),
                [["3", "Aggregated from values for merged CCGs", "geographic"]],
            )
            self.assertEqual(
                read_table(directory, "observation_note"), [["1000", "3"], ["1001", "3"]]
            )

    def test_leaves_a_bridge_no_merge_touches_as_it_was(self):
        with tempfile.TemporaryDirectory() as directory:
            write_seed(
                directory,
                types=[],
                values=[],
                notes=[["1", "Merged", "geographic"], ["2", "Merged ", "geographic"]],
                observation_notes=[["1000", "1"]],
            )
            path = Path(directory, "observation_note.csv.gz")
            before = path.read_bytes()

            tidy_reference_names(directory)

            self.assertEqual(path.read_bytes(), before)

    def test_stops_at_note_types_with_different_categories(self):
        with tempfile.TemporaryDirectory() as directory:
            write_seed(
                directory,
                types=[],
                values=[],
                notes=[["1", "Merged", "geographic"], ["2", "Merged ", "contextual"]],
            )

            with self.assertRaisesRegex(ValueError, "different categories: Merged"):
                tidy_reference_names(directory)

    def test_stops_at_dimension_types_with_different_classes_or_requirements(self):
        for copy in [["2", "Deciles ", "demographic", "f"], ["2", "Deciles ", "inequality", "t"]]:
            with self.subTest(copy=copy), tempfile.TemporaryDirectory() as directory:
                write_seed(
                    directory,
                    types=[["1", "Deciles", "inequality", "f"], copy],
                    values=[],
                    notes=[],
                )

                with self.assertRaisesRegex(ValueError, "classes or requirements: Deciles"):
                    tidy_reference_names(directory)

    def test_stops_at_a_merging_type_with_a_value_the_survivor_lacks(self):
        with tempfile.TemporaryDirectory() as directory:
            write_seed(
                directory,
                types=[["1", "Deciles", "inequality", "f"], ["2", "Deciles ", "inequality", "f"]],
                values=[["10", "1", "", "Most deprived"], ["20", "2", "", "Least deprived"]],
                notes=[],
            )

            with self.assertRaisesRegex(ValueError, "values the other lacks: Least deprived"):
                tidy_reference_names(directory)

    def test_stops_at_two_values_of_one_type_that_tidy_alike(self):
        with tempfile.TemporaryDirectory() as directory:
            write_seed(
                directory,
                types=[["1", "Sex", "core", "t"]],
                values=[["10", "1", "", "Other"], ["11", "1", "", "Other "]],
                notes=[],
            )

            with self.assertRaisesRegex(ValueError, "differ only in whitespace: Other"):
                tidy_reference_names(directory)

    def test_stops_at_an_observation_with_values_in_both_merging_types(self):
        with tempfile.TemporaryDirectory() as directory:
            write_seed(
                directory,
                types=[["1", "Deciles", "inequality", "f"], ["2", "Deciles ", "inequality", "f"]],
                values=[["10", "1", "", "Most deprived"], ["20", "2", "", "Most deprived"]],
                notes=[],
                dimensions=[["1000", "10", "1"], ["1000", "20", "2"]],
            )
            Path(directory, "source-manifest.json").write_text(
                json.dumps({"source_csv_null": NULL_MARKER, "tables": {}})
            )
            before = {path.name: path.read_bytes() for path in Path(directory).iterdir()}

            for _ in range(2):
                with self.assertRaisesRegex(ValueError, "Observation 1000 has a value in two"):
                    tidy_reference_names(directory)

                after = {path.name: path.read_bytes() for path in Path(directory).iterdir()}
                self.assertEqual(after, before)

    def test_keeps_the_published_null_marker_and_records_the_rewritten_files(self):
        with tempfile.TemporaryDirectory() as directory:
            write_seed(
                directory,
                types=[["1", "Deciles", "inequality", "f"]],
                values=[["10", "1", NULL_MARKER, "Most deprived "]],
                notes=[["1", "Merged", "geographic"], ["2", "Merged ", "geographic"]],
                observation_notes=[["1000", "1"], ["1000", "2"]],
            )
            tables = {
                table: {"rows": 0, "bytes": 1, "sha256": "0" * 64}
                for table in ["dimension_type", "dimension_value", "note_type", "observation_note"]
            }
            Path(directory, "source-manifest.json").write_text(
                json.dumps({"source_csv_null": NULL_MARKER, "tables": tables})
            )

            tidy_reference_names(directory)

            self.assertEqual(
                read_table(directory, "dimension_value"),
                [["10", "1", NULL_MARKER, "Most deprived"]],
            )
            manifest = json.loads(Path(directory, "source-manifest.json").read_text())
            self.assertEqual(manifest["reference_names"], "tidied")
            for table, entry in manifest["tables"].items():
                path = Path(directory, f"{table}.csv.gz")
                self.assertEqual(
                    entry,
                    {
                        "rows": 1,
                        "bytes": path.stat().st_size,
                        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                    },
                )

    def test_refuses_an_archive_the_uuid_transform_has_rekeyed(self):
        with tempfile.TemporaryDirectory() as directory:
            write_seed(directory, types=[["1", "Sex ", "core", "t"]], values=[], notes=[])
            Path(directory, "manifest.json").write_text(
                json.dumps({"id_mapping": "deterministic-uuidv7-v1"})
            )

            with self.assertRaisesRegex(ValueError, "before the transform"):
                tidy_reference_names(directory)
            self.assertEqual(read_table(directory, "dimension_type"), [["1", "Sex ", "core", "t"]])


if __name__ == "__main__":
    unittest.main()
