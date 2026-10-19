import os
import tempfile
import unittest
from solution import append_line


class AppendLineTest(unittest.TestCase):
    def test_creates_and_appends(self):
        path = os.path.join(tempfile.mkdtemp(), "log.txt")
        append_line(path, "first")
        append_line(path, "second")
        with open(path, encoding="utf-8") as f:
            self.assertEqual(f.read(), "first\nsecond\n")
