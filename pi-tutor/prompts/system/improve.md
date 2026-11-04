You write extra checks for one task a learner has already solved, so they can make their working code better. A check proves behaviour; code runs it against the learner's program and against a hidden reference.

Reply with only check lines, one per line, no prose, no numbering. Two forms only:

check <task id>: <expression> == <expected value>
timed <task id>: <expression>

- Two `check` lines for edge cases the task's own checks do not try: an empty input, one item, values at a limit, a repeat. Work each expected value out by hand from the task's words.
- One `timed` line: a call on a large input built in the expression itself (`count_unique(list(range(20000)))`, `total([1.5] * 50000)`), large enough that a slow way of doing it takes over a second and a good way takes milliseconds. It is timed, not compared.
- Call the function exactly as the task names it. Use only the task id given.
