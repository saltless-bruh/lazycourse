import type { ExamSpec } from "../extensions/tutor/exam/make.js";

/** A well-formed Python exam as the exam-maker would return it (M8 tests). */
export const PY_EXAM: ExamSpec = {
  title: "Word frequency", task: "Count how often each word appears.",
  requirements: [{ id: "R1", text: "count_words returns a dict of word → count" }, { id: "R2", text: "words are compared lowercase" }],
  examples: "- `count_words('a b a')` → `{'a': 2, 'b': 1}`\n- `count_words('A a')` → `{'a': 2}`",
  concepts: ["dicts", "strings"],
  stub: "def count_words(text):\n    raise NotImplementedError('write count_words')\n",
  tests: "import unittest\nfrom solution import count_words\n\nclass Examples(unittest.TestCase):\n    def test_r1_counts(self):\n        self.assertEqual(count_words('a b a'), {'a': 2, 'b': 1})\n\n    def test_r2_lowercase(self):\n        self.assertEqual(count_words('A a'), {'a': 2})\n",
};
