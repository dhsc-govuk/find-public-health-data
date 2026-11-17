import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("export", Path(__file__).with_name("export-area-categories.py"))
export = importlib.util.module_from_spec(spec)
spec.loader.exec_module(export)


class AreaCategoryExportTest(unittest.TestCase):
    def test_resolves_each_scheme_and_tier_by_dimension_type_and_decile_code(self):
        with patch.object(export, "fetch", side_effect=[{"E10000032": 9}, {"E06000052": 5}, {"E06000052": 6}, {"E06000052": 5}]):
            rows = export.category_rows()
        self.assertEqual(len(rows), 4)
        self.assertEqual(rows, sorted(rows))
        values = {v["id"]: v for v in json.loads((export.HERE.parent / "dimension-values.json").read_text())}
        types = {t["id"]: t["name"] for t in json.loads((export.HERE.parent / "dimension-types.json").read_text())}
        resolved = [(code, types[values[value]["dimensionTypeId"]], values[value]["code"]) for code, value in rows]
        self.assertIn(("E10000032", "County & UA deprivation deciles in England (IMD2025, 4/23 geography)", "9"), resolved)
        self.assertIn(("E06000052", "District & UA deprivation deciles in England (IMD2019, 4/23 geography)", "5"), resolved)
        self.assertEqual(len({value for _, value in rows}), 4)

    def test_missing_memberships_fail_instead_of_writing_a_partial_export(self):
        for result in [{}, [], None]:
            with self.subTest(result=result), patch.object(export, "fetch", return_value=result):
                with self.assertRaisesRegex(ValueError, "No area categories"):
                    export.category_rows()

    def test_rejects_unknown_or_noninteger_deciles(self):
        for decile in [0, 11, "9", 9.5, True, None]:
            with self.subTest(decile=decile), patch.object(export, "fetch", return_value={"E10000032": decile}):
                with self.assertRaisesRegex(ValueError, "Invalid decile for E10000032"):
                    export.category_rows()

    def test_cached_responses_do_not_use_the_network(self):
        with tempfile.TemporaryDirectory(dir=export.HERE) as directory:
            path = "area_categories?profile_id=19"
            cache = Path(directory) / f"{export.hashlib.sha256(path.encode()).hexdigest()}.json"
            cache.write_text('{"E10000032": 9}')
            with patch.object(export, "CACHE", Path(directory)), patch.object(export.urllib.request, "urlopen") as network:
                self.assertEqual(export.fetch(path), {"E10000032": 9})
                network.assert_not_called()


if __name__ == "__main__":
    unittest.main()
