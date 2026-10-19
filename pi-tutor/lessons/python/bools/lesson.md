---
concept: bools
title: "Bools"
tags: [booleans]
source: exercism-python 6105f6d exercises/concept/ghost-gobble-arcade-game (MIT)
requires: [basics]
order: 2
---

# Introduction

Python represents true and false values with the [`bool`][bools] type, which is a subclass of `int`.
 There are only two values in this type: `True` and `False`.
  These values can be bound to a variable:

```python
>>> true_variable = True
>>> false_variable = False
```

We can evaluate Boolean expressions using the `and`, `or`, and `not` operators:

```python
>>> true_variable = True and True
>>> false_variable = True and False

>>> true_variable = False or True
>>> false_variable = False or False

>>> true_variable = not False
>>> false_variable = not True
```

[bools]: https://docs.python.org/3/library/stdtypes.html#typebool

Source: [exercism-python](https://github.com/exercism/python/tree/6105f6d9d3ef66ce3d5c8f529d2882af3d76b706/exercises/concept/ghost-gobble-arcade-game), MIT licence.
