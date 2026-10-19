import unittest
from solution import safe_divide


class SafeDivideTest(unittest.TestCase):
    def test_divides(self):
        self.assertEqual(safe_divide(10, 4), 2.5)

    def test_zero(self):
        self.assertIsNone(safe_divide(1, 0))
