import importlib.util
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("export", Path(__file__).with_name("export-area-neighbours.py"))
export = importlib.util.module_from_spec(spec)
spec.loader.exec_module(export)


class AreaNeighbourExportTest(unittest.TestCase):
    def test_ids_follow_the_natural_key_independently_of_other_rows(self):
        first = export.deterministic_uuid7("E06000001", 1)
        export.deterministic_uuid7("E06000000", 1)
        self.assertEqual(first, export.deterministic_uuid7("E06000001", 1))
        self.assertNotEqual(first, export.deterministic_uuid7("E06000001", 2))
        self.assertNotEqual(first, export.deterministic_uuid7("E06000002", 1))
        self.assertEqual(uuid.UUID(first).version, 7)
        self.assertEqual(uuid.UUID(first).variant, uuid.RFC_4122)

    def test_missing_peer_group_fails_with_the_council_code(self):
        with patch.object(export, "fetch", side_effect=[[{"Code": "E06000001"}], {"NeighbourAreaDet": []}]):
            with self.assertRaisesRegex(ValueError, "neighbour-type-15 group for E06000001"):
                export.neighbour_rows()

    def test_incomplete_rankings_fail_instead_of_writing_a_partial_export(self):
        group = {"NeighbourTypeId": 15, "NeighbourAreas": [{"AreaCode": "E06000006", "Position": 1}]}
        with patch.object(export, "fetch", side_effect=[[{"Code": "E06000001"}], {"NeighbourAreaDet": [group]}]):
            with self.assertRaisesRegex(ValueError, "15 ranked neighbours for E06000001"):
                export.neighbour_rows()

    def test_exports_only_type_15_in_position_order(self):
        neighbours = [{"AreaCode": f"E060000{i + 1:02}", "Position": i} for i in range(1, 16)]
        groups = [{"NeighbourTypeId": 99, "NeighbourAreas": []}, {"NeighbourTypeId": 15, "NeighbourAreas": list(reversed(neighbours))}]
        with patch.object(export, "fetch", side_effect=[[{"Code": "E06000001"}], {"NeighbourAreaDet": groups}]):
            self.assertEqual(export.neighbour_rows(), [("E06000001", n["AreaCode"], n["Position"]) for n in neighbours])


if __name__ == "__main__":
    unittest.main()
