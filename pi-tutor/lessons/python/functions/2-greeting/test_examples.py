import unittest
from solution import greeting


class GreetingTest(unittest.TestCase):
    def test_default(self):
        self.assertEqual(greeting("Ada"), "Hello, Ada!")

    def test_given(self):
        self.assertEqual(greeting("Ada", "?"), "Hello, Ada?")
