# Parse an age

Write `parse_age(text)` that turns text like `"42"` into the number `42`.
If the text is not a whole number, or the number is negative, **raise** `ValueError`.

## Hints

- `int(text)` already raises `ValueError` for text like `"abc"`.
- `raise ValueError("…")` raises your own error with a message.
