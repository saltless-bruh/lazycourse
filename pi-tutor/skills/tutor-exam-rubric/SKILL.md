---
name: tutor-exam-rubric
description: "How lazycourse exams are graded: 80 points for requirements met (each with file:line evidence), 20 for idiomatic code per the language card, late recorded but never deducted, three next fixes without code. Use when grading a submission, writing an exam, or when the learner asks how an exam is scored."
---
# Exam rubric

```
score /100
  ├─ 80 requirements
  │   met / all, each with
  │   file:line evidence
  └─ 20 idioms
      card checklist checks
      passed / all
late: recorded, not deducted
```

## Requirements (80)

- One verdict per requirement in the brief: met or not met.
- Evidence is a `file:line` in the learner's code plus what that line shows. A requirement with no line to point at is not met.
- The example tests are evidence too: a failing test for R2 means R2 is not met unless the code clearly shows otherwise.

## Idioms (20)

- Up to five checks from the language card's checklist (format, names, errors, pitfalls).
- Name what the code does, not what it lacks in general. No checks at all counts as full marks.

## Time

- Going over the limit is recorded as late. The score is the same.

## Next fixes

- Exactly three, most valuable first, one sentence each, never the corrected code. Point at the line and name the idea (for example: "solution.py:4 compares words as typed; lowercase them first").
