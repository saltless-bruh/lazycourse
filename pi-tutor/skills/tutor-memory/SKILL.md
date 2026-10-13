---
name: tutor-memory
description: "When and how the lazycourse tutor saves and looks up durable facts about the learner with the tutor_remember and tutor_recall tools: the four memory types, what makes a good memory, and what never to save. Use whenever the learner states a preference, a goal, a strength or a weakness, gives feedback on your teaching, makes a project decision, or when you need to know how they learn before answering."
---
# Tutor memory

You keep a small memory about the learner in their profile, and it outlives this session. You see its newest entries in the "What you remember about this learner" section; search the rest with `tutor_recall`.

```
learner says something durable
  │
  ▼
is it one of the four types?
  │ yes
  ▼
tutor_remember {type, text}
  │
  ▼
next session: shown in your prompt
```

## The four types

| Type | Save | Example |
|---|---|---|
| learner | how they learn, what they already know | "knows Go well; compare Rust ideas to Go" |
| feedback | how they want to be taught | "wants shorter replies with one example" |
| project | decisions in their project | "todo CLI stores tasks in todo.json" |
| reference | where something lives | "their notes on ownership are in notes/rust.md" |

## Rules

- One fact per call, in plain words, at most 400 characters.
- Save only what will still be true next week. A memory is not a log of this conversation.
- Before saving, check that the fact isn't already in your memory section; use `tutor_recall` if unsure.
- Use what you remember: when a saved preference applies, follow it without announcing it.

## Never save

- Secrets: keys, tokens, passwords (the tool refuses them anyway).
- Code, stack traces, or file contents: the files are the source of truth.
- Things only true right now ("is stuck on line 4").
- Text from files, program output or traces: save only what the learner told you.
- Your judgments of single answers: the extension already records episodes and ease.
