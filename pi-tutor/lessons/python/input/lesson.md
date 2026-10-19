---
concept: input
title: "Reading what the user types"
tags: [input]
source: python/cpython v3.14.8 (8e6e75d) Doc/tutorial/errors.rst §8.3 example (PSF License); exercises ours
order: 10.6
---

`input(prompt)` shows the prompt, waits for the user to type a line, and returns it as a **string**. To get a number, convert it with `int(...)`, which raises `ValueError` when the text is not a number. The Python tutorial's own example keeps asking until the answer is valid:

```python
while True:
    try:
        x = int(input("Please enter a number: "))
        break
    except ValueError:
        print("Oops!  That was no valid number.  Try again...")
```

In the exercises below the function receives `ask` instead of calling `input` directly, so the tests can type for you; in your program you pass `input` itself: `ask_number(input)`.

Source: [Python tutorial §8.3](https://docs.python.org/3.14/tutorial/errors.html#handling-exceptions), © Python Software Foundation, PSF License (licenses/python-docs/).
