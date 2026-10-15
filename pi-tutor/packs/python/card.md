# Python card

- **Format:** `ruff format` (or `black`); lint with `ruff check`. 4-space indent, 88 columns.
- **Names:** `snake_case` functions and variables, `PascalCase` classes, `UPPER_CASE` constants, `_private` by convention.
- **Errors:** exceptions; `try`/`except KeyError` over checking first; catch the narrowest type, never bare `except:`. Tracebacks read bottom-up: last line is the error, the frame above is where.
- **Layout:** `pyproject.toml`, `src/<package>/`, `tests/test_*.py`; scripts end with `if __name__ == "__main__": main()`; use a venv.
- **Test:** `python3 -m pytest` when pytest is installed, else `python3 -m unittest`.
- **Newer:** `match` (3.10), `except*` (3.11), `type X = …` (3.12), `t"…"` strings, lazy annotations, `except A, B:` (3.14). Hints are checked by mypy/pyright, not at run time.
- **Pitfalls:** a mutable default (`def f(x=[])`) is shared between calls; a closure in a loop sees the last value; `is` compares identity, not value; changing a list while looping over it skips items; `/` is float division, `//` floors; naming a variable `list` or `id` hides the builtin.

## Concept tags
- `variables`: names, assignment (aliases: assignment, mutability)
- `numbers`: int, float, division (aliases: integer-division, floats)
- `strings`: text, f-strings (aliases: f-strings, string-formatting)
- `lists`: indexing, slicing (aliases: list-index, indexerror)
- `dicts`: lookups, KeyError (aliases: dictionary, dict-lookup, keyerror, dictionary-key-error, dict-keys)
- `sets-tuples`: set, tuple, unpacking (aliases: tuples, sets, unpacking)
- `loops`: for, range, off-by-one (aliases: for-loop, range, off-by-one, off-by-one-error, iteration)
- `comprehensions`: comprehensions (aliases: list-comprehension)
- `functions`: def, parameters (aliases: parameters, default-arguments, mutable-default, mutable-defaults)
- `scope`: closures, globals (aliases: closures, nonlocal)
- `classes`: classes, dataclasses (aliases: oop, dataclasses, objects)
- `exceptions`: raise, try/except (aliases: error-handling, errors, traceback, exception-handling, bare-except)
- `files-io`: files, paths (aliases: files, pathlib, context-managers, context-manager, file-io, file-i-o)
- `modules`: imports (aliases: imports, packages)
- `iterators`: generators (aliases: generators)
- `typing`: type hints (aliases: type-hints)
- `pattern-matching`: match/case (aliases: match)
- `testing`: tests (aliases: pytest, unittest)
- `async`: async/await (aliases: asyncio)
