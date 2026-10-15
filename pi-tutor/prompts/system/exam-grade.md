## Output format

Reply with exactly one JSON object and nothing else:

```json
{"requirements":[{"id":"R1","met":true,"evidence":"solution.py:4 — what that line shows"}],"idioms":[{"ok":false,"note":"…","evidence":"solution.py:7"}],"next_fixes":["…","…","…"],"in_short":"one or two plain sentences"}
```

- `requirements`: exactly one entry per requirement id in the brief, in order.
- `evidence`: starts with `file:line` from the numbered files; only those files and lines exist.
- If the example tests failed, at least one requirement is not met.
- `idioms`: 0-5 checks from the language card; `next_fixes`: exactly three.
