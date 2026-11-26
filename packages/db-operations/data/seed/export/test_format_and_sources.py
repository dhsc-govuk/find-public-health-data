"""Checks for the format and sources a Fingertips indicator is given."""

import unittest

from format_and_sources import format_and_sources

DEATHS = {"definition": "Deaths", "source": "ONS"}
POPULATION = {"definition": "Population", "source": "ONS population"}
NONE = {"definition": None, "source": None}


class FormatAndSourcesTest(unittest.TestCase):
    def test_gives_both_sides_with_the_disclosure_control_on_the_numerator(self):
        result = format_and_sources(DEATHS, POPULATION, "yes", "Counts under 5 suppressed")

        self.assertEqual(result["has_numerator_denominator"], True)
        self.assertEqual(result["numerator"]["disclosure_control"], "yes")
        self.assertEqual(
            result["numerator"]["disclosure_control_detail"], "Counts under 5 suppressed"
        )
        self.assertEqual(result["denominator"]["disclosure_control"], None)
        self.assertEqual(result["data_value"], None)

    def test_gives_one_side_as_the_data_value_with_no_as_not_applicable(self):
        result = format_and_sources(NONE, POPULATION, "no", None)

        self.assertEqual(result["has_numerator_denominator"], False)
        self.assertEqual(result["numerator"], None)
        self.assertEqual(
            result["data_value"],
            {**POPULATION, "disclosure_control": "not-applicable", "disclosure_control_detail": None},
        )

    def test_counts_a_blank_definition_or_source_name_as_no_side(self):
        result = format_and_sources(DEATHS, {"definition": " ", "source": ""}, " ", None)

        self.assertEqual(result["has_numerator_denominator"], False)
        self.assertEqual(result["data_value"]["definition"], "Deaths")
        self.assertEqual(result["data_value"]["disclosure_control"], None)

    def test_leaves_the_question_unanswered_with_neither_side(self):
        result = format_and_sources(NONE, NONE, "yes", "Suppressed")

        self.assertEqual(
            result,
            {
                "has_numerator_denominator": None,
                "numerator": None,
                "denominator": None,
                "data_value": None,
            },
        )


if __name__ == "__main__":
    unittest.main()
