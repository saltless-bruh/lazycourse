import unittest
from solution import ask_number


def typed(*answers):
    it = iter(answers)
    return lambda prompt: next(it)


class AskNumberTest(unittest.TestCase):
    def test_first_try(self):
        self.assertEqual(ask_number(typed("7")), 7)

    def test_keeps_asking(self):
        self.assertEqual(ask_number(typed("seven", "", "12")), 12)
