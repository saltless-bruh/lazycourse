import unittest
from solution import parse_age


class ParseAgeTest(unittest.TestCase):
    def test_number(self):
        self.assertEqual(parse_age("42"), 42)

    def test_not_a_number(self):
        with self.assertRaises(ValueError):
            parse_age("forty")

    def test_negative(self):
        with self.assertRaises(ValueError):
            parse_age("-3")
