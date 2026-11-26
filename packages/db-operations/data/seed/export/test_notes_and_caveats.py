"""Checks for the notes and caveats translation the exports apply."""

import re
import runpy
import unittest
from pathlib import Path

from notes_and_caveats import (
    NOTES_AND_CAVEATS_COLUMNS,
    VOCABULARY,
    normalised,
    notes_and_caveats,
    notes_and_caveats_select,
)

reshape = runpy.run_path(str(Path(__file__).with_name("reshape-indicator-versions.py")))


class NotesAndCaveatsTest(unittest.TestCase):
    def test_keeps_each_prose_as_the_detail_of_a_yes(self):
        self.assertEqual(
            notes_and_caveats(
                {
                    "disclosure_control": " Counts under 5 are suppressed.\n",
                    "caveats": "Survey data.",
                    "notes": "Revised in 2024.",
                }
            ),
            {
                "disclosure_control": "yes",
                "disclosure_control_detail": "Counts under 5 are suppressed.",
                "has_caveats": "true",
                "caveats_detail": "Survey data.",
                "has_other_notes": "true",
                "other_notes_detail": "Revised in 2024.",
            },
        )

    def test_leaves_a_question_with_blank_or_missing_prose_unanswered(self):
        self.assertEqual(
            notes_and_caveats({"disclosure_control": " \n", "caveats": None}),
            dict.fromkeys(NOTES_AND_CAVEATS_COLUMNS),
        )

    def test_answers_no_to_prose_that_says_none_was_applied_or_needed(self):
        for prose in [
            "None applied",
            "Not applied",
            "None",
            "None required",
            "None needed",
            "Not required",
            "No disclosure control applied",
            "No disclosure control required",
            "No disclosure control was required",
            "No disclosure control applied. Data source is in the public domain.",
        ]:
            with self.subTest(prose=prose):
                columns = notes_and_caveats({"disclosure_control": prose})
                self.assertEqual(columns["disclosure_control"], "no")
                self.assertIsNone(columns["disclosure_control_detail"])

    def test_answers_not_applicable_to_prose_that_says_so(self):
        for prose in ["Not applicable", "N/A", "n/a."]:
            with self.subTest(prose=prose):
                columns = notes_and_caveats({"disclosure_control": prose})
                self.assertEqual(columns["disclosure_control"], "not-applicable")
                self.assertIsNone(columns["disclosure_control_detail"])

    def test_answers_no_to_caveats_and_notes_of_none(self):
        self.assertEqual(
            notes_and_caveats({"caveats": "None.", "notes": "N/A"}),
            {
                **dict.fromkeys(NOTES_AND_CAVEATS_COLUMNS),
                "has_caveats": "false",
                "has_other_notes": "false",
            },
        )

    def test_matches_once_markup_spacing_case_and_one_full_stop_are_set_aside(self):
        self.assertEqual(normalised("<p>None\n  Applied.</p>"), "none applied")
        self.assertEqual(normalised("None applied.."), "none applied.")
        columns = notes_and_caveats({"disclosure_control": "<p>None  applied.</p>"})
        self.assertEqual(columns["disclosure_control"], "no")

    def test_keeps_any_other_prose_as_the_detail_of_a_yes(self):
        for prose in [
            "Not required. Data is already in the public domain and suppressed at source.",
            "Not applicable, however values for Isles of Scilly will be suppressed.",
            "Not applied. Data are publicly available on the ONS website.",
            "None applied..",
            "Nothing",
        ]:
            with self.subTest(prose=prose):
                self.assertEqual(
                    notes_and_caveats({"disclosure_control": prose})["disclosure_control"], "yes"
                )
                self.assertEqual(
                    notes_and_caveats({"disclosure_control": prose})["disclosure_control_detail"],
                    prose,
                )

    def test_answers_caveats_with_disclosure_control_words_as_a_yes(self):
        self.assertEqual(notes_and_caveats({"caveats": "Not applied"})["has_caveats"], "true")

    def test_holds_its_vocabulary_already_normalised(self):
        for _, prose, _ in VOCABULARY:
            with self.subTest(prose=prose):
                self.assertEqual(normalised(prose), prose)

    def test_selects_every_column_it_writes_in_order(self):
        select = notes_and_caveats_select("m")

        self.assertEqual(re.findall(r" AS (\w+)", select), NOTES_AND_CAVEATS_COLUMNS)


class VersionColumnsTest(unittest.TestCase):
    def test_carries_the_answers_in_place_of_the_fingertips_prose(self):
        columns = reshape["VERSION_COLUMNS"]

        self.assertNotIn("caveats", columns)
        self.assertNotIn("notes", columns)
        start = columns.index("disclosure_control")
        self.assertEqual(
            columns[start : start + len(NOTES_AND_CAVEATS_COLUMNS)], NOTES_AND_CAVEATS_COLUMNS
        )


if __name__ == "__main__":
    unittest.main()
