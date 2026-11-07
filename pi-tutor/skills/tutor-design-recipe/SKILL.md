---
name: tutor-design-recipe
description: "The six-step design recipe the lazycourse tutor uses to take a task from written requirements to working code while the learner does every step: Find, Shape, Examples, Steps, Map, Build, with what the tutor does per band. Use when a [workflow] line is in context, when the learner runs :TutorPlan or /tutor-plan, or whenever the learner does not know how to start a task from spec/tasks.md, even if they do not name the recipe."
---
# Design recipe

The learner turns a written task into code one artifact at a time. The tutor asks, checks and hints; the learner produces every artifact.

```
1 Find
  which task, in your own words
  │
  ▼
2 Shape
  what goes in, what comes back
  │
  ▼
3 Examples
  2-3 concrete cases
  │
  ▼
4 Steps
  the job in plain words
  │
  ▼
5 Map
  each step → a construct
  │
  ▼
6 Build
  one step at a time, run it
```

## The steps

The `[workflow]` line gives each step's "the learner writes" and its one-sentence meaning; use those words.

1. Find: the learner says which task they are on and what it should do, in their own words ("I'm doing P1.T1, it makes the secret number").
2. Shape: what goes in and what comes back. Plain words are enough ("it takes the total and the people and gives back each share"); a typed line such as `argv: list[str] → Command` is welcome, not required.
3. Examples: 2-3 concrete cases of what goes in and what should come out, one of them an edge case. Rows like `f(48, 3) → 16` become runnable checks in step 6.
4. Steps: the job as plain sentences in order ("first …, then …"), numbered or not, no code.
5. Map: each step → the piece of the language that does it (loop, dict lookup, `match`, …). Load the cookbook skill the language card lists (`tutor-<lang>-cookbook`): its recipes are indexed by the same plain steps the learner wrote in step 4, so find each step there and show that recipe's example, never their task.
6. Build: the learner writes one step, runs it, compares with the examples, then moves to the next step.

Finish a step only when the learner has written its artifact themselves; then set `step_done` to true in the judgment block. A question, "skip" or "I don't understand" is no artifact: the extension handles a skip and asks you to explain the step when they are lost. The extension moves the workflow to the next step, and the next `[workflow]` line names it.

## Per band

| Band | Tutor | Learner |
|---|---|---|
| beginner | shows the step on an unrelated example, never the learner's own; at step 5 shows an unrelated mini example per construct | writes each artifact |
| intermediate | asks one question per step and checks the answer | writes each artifact in full |
| pro | names the step only | does everything; the tutor reviews |

## Example (beginner, step 2 Shape)

Task: "P1.T1 Parse the command line into a Command".

> **What to try**: for a different job, "add up a shopping list", the shape is: it takes the prices and gives back the total.
> Now yours: what does your task take, and what does it give back?
> **In short**: name what goes in and what comes out.

The tutor never fills in the learner's own shape: it shows the form on an unrelated job and leaves their task to them.
