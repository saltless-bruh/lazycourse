---
concept: exceptions
title: "Errors: try, except and raise"
tags: [exceptions]
source: python/cpython v3.14.8 (8e6e75d) Doc/tutorial/errors.rst §8.3–8.4 (PSF License)
checked: doctest
requires: [functions, conditionals]
order: 10.5
---

From the Python tutorial, *Errors and Exceptions* (excerpt):

It is possible to write programs that handle selected exceptions. Look at the
following example, which asks the user for input until a valid integer has been
entered, but allows the user to interrupt the program (using `Control-C` or
whatever the operating system supports); note that a user-generated interruption
is signalled by raising the `KeyboardInterrupt` exception.

```python
>>> while True:
...     try:
...         x = int(input("Please enter a number: "))
...         break
...     except ValueError:
...         print("Oops!  That was no valid number.  Try again...")
...
```

The `try` statement works as follows.

* First, the *try clause* (the statement(s) between the `try` and
  `except` keywords) is executed.

* If no exception occurs, the *except clause* is skipped and execution of the
  `try` statement is finished.

* If an exception occurs during execution of the `try` clause, the rest of the
  clause is skipped.  Then, if its type matches the exception named after the
  `except` keyword, the *except clause* is executed, and then execution
  continues after the try/except block.

* If an exception occurs which does not match the exception named in the *except
  clause*, it is passed on to outer `try` statements; if no handler is
  found, it is an *unhandled exception* and execution stops with an error message.

A `try` statement may have more than one *except clause*, to specify
handlers for different exceptions.  At most one handler will be executed.
Handlers only handle exceptions that occur in the corresponding *try clause*,
not in other handlers of the same `try` statement.  An *except clause*
may name multiple exceptions, for example:

```python
... except RuntimeError, TypeError, NameError:
...     pass
```


## Raising exceptions

The `raise` statement allows the programmer to force a specified
exception to occur. For example:

```python
>>> raise NameError('HiThere')
Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
    raise NameError('HiThere')
NameError: HiThere
```

The sole argument to `raise` indicates the exception to be raised.
This must be either an exception instance or an exception class (a class that
derives from `BaseException`, such as `Exception` or one of its
subclasses).  If an exception class is passed, it will be implicitly
instantiated by calling its constructor with no arguments:

```python
raise ValueError  # shorthand for 'raise ValueError()'
```

Source: [Python tutorial §8.3–8.4](https://docs.python.org/3.14/tutorial/errors.html#handling-exceptions), © Python Software Foundation, PSF License (licenses/python-docs/).
