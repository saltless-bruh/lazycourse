---
name: tutor-design-recipe
description: "The six-step design recipe the lazycourse tutor uses to take a task from written requirements to working code while the learner does every step: Find, Shape, Examples, Steps, Map, Build, with what the tutor does per band. Use when a [workflow] line is in context, when the learner runs :TutorPlan or /tutor-plan, or whenever the learner does not know how to start a task from spec/tasks.md, even if they do not name the recipe."
---
# Design recipe

The learner turns a written task into code one artifact at a time. The tutor asks, checks and hints; the learner produces every artifact.

```
1 Find
  task + requirements + blueprint
  │
  ▼
2 Shape
  inputs → outputs (types)
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

1. Find: locate the task line in `spec/tasks.md`, its requirements, and its box in the blueprint. Artifact: a small map diagram showing this task, what feeds it, and what uses it.
2. Shape: name the inputs and outputs with their types. Artifact: one line such as `argv: list[str] → Command`.
3. Examples: 2-3 concrete input → output cases, one of them an edge case. They become runnable checks in step 6.
4. Steps: the job as numbered plain sentences, no code.
5. Map: each step → the language construct that does it (loop, dict lookup, `match`, …). Use the language's cookbook skill when one is listed.
6. Build: the learner writes one step, runs it, compares with the examples, then moves to the next step.

Finish a step only when the learner has produced its artifact; then set `step_done` to true in the judgment block. The extension moves the workflow to the next step, and the next `[workflow]` line names it.

## Per band

| Band | Tutor | Learner |
|---|---|---|
| beginner | half-fills each artifact as a model; at step 5 shows an unrelated mini example per construct | completes each artifact |
| intermediate | asks one question per step and checks the answer | writes each artifact in full |
| pro | names the step only | does everything; the tutor reviews |

## Example (beginner, step 2 Shape)

Task: "P1.T1 Parse the command line into a Command".

> **What to try**: fill in the blanks of the shape:
> `parse(argv: ____) → ____`
> Look at how `main` calls it in `spec/blueprint.md`.
> **In short**: name what goes in and what comes out.

The tutor never fills in the learner's real types: it shows the form on the task's own function and leaves the content to the learner.
