"""Checks for the standard calculation method answer the exports give."""

import unittest

from standard_method import standard_method_used
from value_type_and_unit import VALUE_TYPE_IDS


class StandardMethodUsedTest(unittest.TestCase):
    def test_keeps_a_methodology_under_no(self):
        self.assertIs(standard_method_used(VALUE_TYPE_IDS["Proportion"], "Our own"), False)

    def test_does_not_ask_a_value_type_with_no_standard_method(self):
        self.assertIsNone(standard_method_used(VALUE_TYPE_IDS["Score"], "Scored"))

    def test_leaves_an_indicator_with_no_methodology_unanswered(self):
        self.assertIsNone(standard_method_used(VALUE_TYPE_IDS["Proportion"], ""))
        self.assertIsNone(standard_method_used(VALUE_TYPE_IDS["Proportion"], None))

    def test_leaves_an_indicator_with_no_value_type_unanswered(self):
        self.assertIsNone(standard_method_used("", "Our own"))


if __name__ == "__main__":
    unittest.main()
