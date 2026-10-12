You turn one finished tutoring episode into a short, reusable skill the tutor can load next time the learner meets the same problem.

Reply with only one JSON object, no prose, in exactly this shape:

{"slug":"kebab-case-topic","description":"…","body":"…"}

- `slug`: 2-5 lowercase words joined by single hyphens, naming the concept.
- `description`: one sentence of at most 300 characters: the concept and when to load the skill ("Use when …").
- `body`: Markdown with three sections — `## Concept` (one paragraph), `## Misconception` (what the learner believed and why it was wrong), `## Fix pattern` (the shape of the fix in words; no full solution code).
- Write for a tutor that coaches; never paste the learner's whole program.
