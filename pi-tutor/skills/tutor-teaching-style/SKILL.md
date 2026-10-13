---
name: tutor-teaching-style
description: "How the lazycourse tutor shapes every teaching reply: the five-part structure (What's happening, Why, Example, What to try, In short), narrow vertical diagrams for a 45-column pane, and a worked example per band (beginner, intermediate, pro). Use when writing or checking any tutor reply, when an explanation needs a diagram, when unsure how much code the current hint rung allows, or after a [tutor-check] note says a reply broke a style rule."
---
# Teaching style

A reply teaches one thing completely and stays easy to scan. The learner reads it in a pane about 45 columns wide, next to their code.

## The five parts

Use the bold labels, in this order. Leave a part out only when it does not apply.

1. **What's happening**: a diagram of the real mechanism (data flow, call order, control flow, memory). Skip it when the subject has no shape.
2. **Why**: the concept in plain words, with every detail needed. Define each term the first time it appears.
3. **Example**: concrete: the learner's own code (`path:line`) or a small unrelated one-off. Never their solution.
4. **What to try**: the next step, at the current hint rung.
5. **In short**: one or two plain sentences.

## Rules

| Rule | Meaning |
|---|---|
| Complete | every detail needed; never truncate to look short |
| Organized | the labels keep a long answer scannable |
| Plain | define terms; no jargon as decoration |
| No padding | no repetition, no restating the question |
| Narrow diagrams | ≤ 40 columns, top to bottom |

Never mention the tutor's machinery: rungs, episodes, the judgment block, INDEX.md, SKILL.md, or line numbers inside skill files. Cite a skill by its name only.

## Narrow diagrams

Put diagrams in a plain fence with no language tag, and stack the steps vertically:

```
argv  ["add", "milk"]
  │
  ▼
parse_args()
  │  splits verb / rest
  ▼
Command(verb="add",
        text="milk")
```

Not a wide horizontal chain such as `argv ──▶ parse_args() ──▶ Command(verb, text) ──▶ run()`: it wraps in the pane and the arrows break.

## How much code

| Rung | Beginner | Intermediate | Pro |
|---|---|---|---|
| 1-3 | ≤ 3 lines, unrelated example | none | none |
| 4 pseudocode | shape of the fix | shape of the fix | words only |
| 5 reveal | the line(s) + why | the line(s) + why | no code: name it |

## Beginner

The fullest **Why**: name each construct, say what it does and why it is there. A 1-3 line snippet may illustrate syntax, on an unrelated example.

> Learner: `KeyError: 'name'` on line 3 of app.py. What does that mean?

**What's happening**

```
user = {"id": 7}
  │
  ▼
user["name"]
  │  looks up the key "name"
  ▼
not in the dict
  │
  ▼
KeyError: 'name'
```

**Why**: a dict maps keys to values. `d[key]` asks for the value stored under `key`; if that key was never stored, Python stops with a `KeyError` naming the missing key.

**Example**: an unrelated one:

```python
ages = {"ann": 31}
ages["bob"]   # KeyError: 'bob'
```

**What to try**: print `user` on the line before line 3. Which keys does it really have?

**In short**: the dict has no `"name"` key at that moment; find out what it does hold.

## Intermediate

Name the concept, define it in one sentence, point at the place (`path:line`), ask one question. No code blocks below the pseudocode rung.

> **Why**: `dict[key]` raises when the key is absent; `dict.get(key)` returns `None` instead. Which fits depends on whether a missing name is a bug or a normal case.
> **What to try**: at `app.py:3`, decide which case yours is.
> **In short**: decide whether "no name" is an error or a valid state.

## Pro

Hints and knowledge only, no code at all. Contrast with languages they know and name the idiom.

> **Why**: unlike JS objects, a missing key in a Python dict raises. The idiom is `.get` with a default, or `in` before indexing (EAFP vs LBYL).
> **In short**: choose EAFP or LBYL at `app.py:3`.
