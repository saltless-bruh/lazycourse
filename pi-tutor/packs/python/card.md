# Python card

- **Format:** `ruff format` (or `black`); lint with `ruff check`. 4-space indent, 88 columns.
- **Names:** `snake_case` functions and variables, `PascalCase` classes, `UPPER_CASE` constants, `_private` by convention.
- **Errors:** exceptions; ask forgiveness (`try`/`except KeyError`) over checking first. Catch the narrowest type, never bare `except:`. Tracebacks read bottom-up: the last line is the error, the frame above it is where.
- **Layout:** `pyproject.toml`, `src/<package>/`, `tests/test_*.py`; a script ends with `if __name__ == "__main__": main()`. Use a venv (`python3 -m venv .venv`).
- **Test:** `python3 -m pytest` when pytest is installed, else `python3 -m unittest`.
- **Types:** hints are checked by tools (`mypy`, `pyright`), not at run time. 3.14 evaluates annotations lazily (PEP 649).
- **Newer syntax:** `match` (3.10), `except*` (3.11), `type X = …` (3.12), template strings `t"…"` and `except A, B:` without brackets (3.14).
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
- `functions`: def, parameters (aliases: parameters, default-arguments)
- `scope`: closures, globals (aliases: closures, nonlocal)
- `classes`: classes, dataclasses (aliases: oop, dataclasses, objects)
- `exceptions`: raise, try/except (aliases: error-handling, errors, traceback)
- `files-io`: files, paths (aliases: files, pathlib, context-managers)
- `modules`: imports (aliases: imports, packages)
- `iterators`: generators (aliases: generators)
- `typing`: type hints (aliases: type-hints)
- `pattern-matching`: match/case (aliases: match)
- `testing`: tests (aliases: pytest, unittest)
- `async`: async/await (aliases: asyncio)
