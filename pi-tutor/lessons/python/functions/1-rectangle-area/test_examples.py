import unittest
from solution import rectangle_area


class RectangleAreaTest(unittest.TestCase):
    def test_small(self):
        self.assertEqual(rectangle_area(3, 4), 12)

    def test_square(self):
        self.assertEqual(rectangle_area(5, 5), 25)

    def test_zero(self):
        self.assertEqual(rectangle_area(0, 7), 0)
