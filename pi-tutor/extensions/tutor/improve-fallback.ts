// Ready-made "improve it" programs (Phase 8 A8, option C, author 2026-11-07). The intermediate step-up asks the
// model for working but clumsy code; a weak model often writes code that does not work, and handing that over
// would make the part a bug hunt. After two failed asks one of these is used instead. Each is vetted by
// test/improve-fallback.test.ts the way the step-up uses it: the hidden solution passes every check, the clumsy
// code passes the task's checks, and the solution measures better on something and worse on nothing.
import { parseChecks, type Check } from "./checks.js";

export interface ImproveFallback {
  /** The task as the learner reads it in stepup/README.md. */
  task: string;
  /** stepup/improve.py as handed over: correct, clumsy on purpose. */
  clumsy: string;
  /** The hidden solution the checks are confirmed on (never written into the project). */
  reference: string;
  /** The task's checks, which must keep passing. */
  checks: string[];
  /** Edge-case checks and one timed large-input check (habits Task 17). */
  extra: string[];
}

export const IMPROVE_FALLBACKS: ImproveFallback[] = [
  {
    task: "Write `count_unique(items)` returning how many different items the list has.",
    clumsy: [
      "def count_unique(items):",
      "    seen = []",
      "    for x in items:",
      "        found = False",
      "        for y in seen:",
      "            if y == x:",
      "                found = True",
      "        if not found:",
      "            seen.append(x)",
      "    return len(seen)",
    ].join("\n") + "\n",
    reference: "def count_unique(items):\n    return len(set(items))\n",
    checks: ["check P1.T1: count_unique([1, 1, 2]) == 2", "check P1.T1: count_unique(['a', 'b', 'a', 'c']) == 3"],
    extra: ["check P1.T1: count_unique([]) == 0", "timed P1.T1: count_unique(list(range(3000)))"],
  },
  {
    task: "Write `has_duplicate(items)` returning True when some item appears more than once.",
    clumsy: [
      "def has_duplicate(items):",
      "    result = False",
      "    for i in range(len(items)):",
      "        for j in range(len(items)):",
      "            if i != j:",
      "                if items[i] == items[j]:",
      "                    result = True",
      "    return result",
    ].join("\n") + "\n",
    reference: "def has_duplicate(items):\n    return len(set(items)) != len(items)\n",
    checks: ["check P1.T1: has_duplicate([1, 2, 3]) == False", "check P1.T1: has_duplicate([1, 2, 1]) == True"],
    extra: ["check P1.T1: has_duplicate([]) == False", "timed P1.T1: has_duplicate(list(range(2000)))"],
  },
  {
    task: "Write `pair_sum(nums, target)` returning True when two numbers at different positions add up to target.",
    clumsy: [
      "def pair_sum(nums, target):",
      "    found = False",
      "    for i in range(len(nums)):",
      "        for j in range(len(nums)):",
      "            if i != j:",
      "                if nums[i] + nums[j] == target:",
      "                    found = True",
      "    return found",
    ].join("\n") + "\n",
    reference: [
      "def pair_sum(nums, target):",
      "    seen = set()",
      "    for x in nums:",
      "        if target - x in seen:",
      "            return True",
      "        seen.add(x)",
      "    return False",
    ].join("\n") + "\n",
    checks: ["check P1.T1: pair_sum([1, 4, 6], 10) == True", "check P1.T1: pair_sum([1, 4, 6], 2) == False", "check P1.T1: pair_sum([5], 10) == False"],
    extra: ["check P1.T1: pair_sum([5, 5], 10) == True", "timed P1.T1: pair_sum(list(range(2000)), -1)"],
  },
  {
    task: "Write `most_common_word(text)` returning the word that appears most often (the first one on a tie; \"\" for no words).",
    clumsy: [
      "def most_common_word(text):",
      "    words = text.split()",
      "    best = \"\"",
      "    best_count = 0",
      "    for w in words:",
      "        count = 0",
      "        for v in words:",
      "            if v == w:",
      "                count = count + 1",
      "        if count > best_count:",
      "            best = w",
      "            best_count = count",
      "    return best",
    ].join("\n") + "\n",
    reference: [
      "def most_common_word(text):",
      "    counts = {}",
      "    for w in text.split():",
      "        counts[w] = counts.get(w, 0) + 1",
      "    return max(counts, key=counts.get) if counts else \"\"",
    ].join("\n") + "\n",
    checks: ["check P1.T1: most_common_word('a b a') == 'a'", "check P1.T1: most_common_word('x y z y') == 'y'"],
    extra: ["check P1.T1: most_common_word('') == ''", "check P1.T1: most_common_word('b a a b') == 'b'", "timed P1.T1: most_common_word(' '.join(str(i % 50) for i in range(3000)))"],
  },
  {
    task: "Write `second_largest(nums)` returning the second largest different value, or None when there is none.",
    clumsy: [
      "def second_largest(nums):",
      "    distinct = []",
      "    for x in nums:",
      "        if x not in distinct:",
      "            distinct.append(x)",
      "    if len(distinct) < 2:",
      "        return None",
      "    largest = distinct[0]",
      "    for x in distinct:",
      "        if x > largest:",
      "            largest = x",
      "    second = None",
      "    for x in distinct:",
      "        if x != largest:",
      "            if second is None or x > second:",
      "                second = x",
      "    return second",
    ].join("\n") + "\n",
    reference: "def second_largest(nums):\n    top = sorted(set(nums))\n    return top[-2] if len(top) >= 2 else None\n",
    checks: ["check P1.T1: second_largest([3, 1, 2]) == 2", "check P1.T1: second_largest([5, 5, 4]) == 4", "check P1.T1: second_largest([7]) == None"],
    extra: ["check P1.T1: second_largest([]) == None", "timed P1.T1: second_largest(list(range(3000)))"],
  },
  {
    task: "Write `word_lengths(words)` returning a dict from each word length to how many words have it.",
    clumsy: [
      "def word_lengths(words):",
      "    result = {}",
      "    for w in words:",
      "        n = len(w)",
      "        found = False",
      "        for k in result:",
      "            if k == n:",
      "                found = True",
      "        if found:",
      "            result[n] = result[n] + 1",
      "        else:",
      "            result[n] = 1",
      "    return result",
    ].join("\n") + "\n",
    reference: "def word_lengths(words):\n    result = {}\n    for w in words:\n        result[len(w)] = result.get(len(w), 0) + 1\n    return result\n",
    checks: ["check P1.T1: word_lengths(['a', 'bb', 'cc']) == {1: 1, 2: 2}", "check P1.T1: word_lengths(['tree']) == {4: 1}"],
    extra: ["check P1.T1: word_lengths([]) == {}", "timed P1.T1: word_lengths(['x' * (i % 400) for i in range(4000)])"],
  },
];

/** A fallback's checks and extra checks as parsed checks (unverified until confirmed on its hidden solution). */
export function fallbackChecks(f: ImproveFallback): { checks: Check[]; extra: Check[] } {
  const parse = (lines: string[]) => parseChecks(lines.join("\n"), { language: "python", taskIds: ["P1.T1"], milestone: 1 }).checks;
  return { checks: parse(f.checks), extra: parse(f.extra) };
}

/** The fallback to use: a different one per step-up (by when it started), so a retake gets another program. */
export function pickFallback(started: number): ImproveFallback {
  return IMPROVE_FALLBACKS[Math.abs(Math.floor(started / 1000)) % IMPROVE_FALLBACKS.length];
}
