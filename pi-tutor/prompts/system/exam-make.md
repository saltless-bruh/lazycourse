## Output format

Reply with exactly one JSON object and nothing else:

```json
{"title":"Word frequency","task":"one paragraph: what to build and why","requirements":[{"id":"R1","text":"…"},{"id":"R2","text":"…"}],"examples":"markdown list of input → output cases","concepts":["tag-from-the-card"],"stub":"the stub file's full text","tests":"the test file's full text"}
```

- `requirements`: 2 to 6, ids `R1`, `R2`, … in order. A small exam fits the time limit with 2-3, a medium one with 3-6.
- `concepts`: 1-3 tags from the language card's Concept tags list.
- `stub` and `tests`: follow the file rules given below for this language exactly.
- The tests must fail against the stub and pass against a correct solution. Name each test after its requirement id as the file rules say.
