import os
import tempfile
import unittest
from solution import count_lines


class CountLinesTest(unittest.TestCase):
    def file(self, text):
        fd, path = tempfile.mkstemp(text=True)
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
        self.addCleanup(os.remove, path)
        return path

    def test_three(self):
        self.assertEqual(count_lines(self.file("a\nb\nc\n")), 3)

    def test_empty(self):
        self.assertEqual(count_lines(self.file("")), 0)
