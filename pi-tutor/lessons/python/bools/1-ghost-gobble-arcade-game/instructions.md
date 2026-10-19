# Instructions

In this exercise, you need to implement some rules from [Pac-Man][Pac-Man], the classic 1980s-era arcade-game.

You have four rules to implement, all related to the game states.

> _Do not worry about how the arguments are derived, just focus on combining the arguments to return the intended result._

## 1. Define if Pac-Man eats a ghost

Define the `eat_ghost()` function that takes two parameters (_if Pac-Man has a power pellet active_ and _if Pac-Man is touching a ghost_) and returns a Boolean value if Pac-Man is able to eat a ghost.
 The function should return `True` only if Pac-Man has a power pellet active and is touching a ghost.

```python
>>> eat_ghost(False, True)
...
False
```

## 2. Define if Pac-Man scores

Define the `score()` function that takes two parameters (_if Pac-Man is touching a power pellet_ and _if Pac-Man is touching a dot_) and returns a Boolean value if Pac-Man scored.
 The function should return `True` if Pac-Man is touching a power pellet or a dot.

```python
>>> score(True, True)
...
True
```

## 3. Define if Pac-Man loses

Define the `lose()` function that takes two parameters (_if Pac-Man has a power pellet active_ and _if Pac-Man is touching a ghost_) and returns a Boolean value if Pac-Man loses.
 The function should return `True` if Pac-Man is touching a ghost and does not have a power pellet active.

```python
>>> lose(False, True)
...
True
```

## 4. Define if Pac-Man wins

Define the `win()` function that takes three parameters (_if Pac-Man has eaten all of the dots_, _if Pac-Man has a power pellet active_, and _if Pac-Man is touching a ghost_) and returns a Boolean value if Pac-Man wins.
 The function should return `True` if Pac-Man has eaten all of the dots and has not lost based on the rules defined in part 3.

```python
>>> win(False, True, False)
...
False
```

[Pac-Man]: https://en.wikipedia.org/wiki/Pac-Man

## Hints

## General

- For an overview, this section of the Python documentation: [Truth Value Testing][stdlib-bools] might help.
- Don't worry about how the arguments are _derived_, focus on combining the arguments to return the intended result.

## 1. Define if Pac-Man can eat a ghost

- You can use the [Boolean][boolean] [operators][Boolean-operators] to combine arguments for a result.

## 2. Define if Pac-Man scores

- You can use the [Boolean][boolean] [operators][Boolean-operators] to combine arguments for a result.

## 3. Define if Pac-Man loses

- You can use the [boolean][Boolean] [operators][Boolean-operators] to combine arguments for a result.

## 4. Define if Pac-Man wins

- You can use the [Boolean][boolean] [operators][Boolean-operators] to combine arguments for a result.

[Boolean-operators]: https://docs.python.org/3/library/stdtypes.html#boolean-operations-and-or-not
[boolean]: https://docs.python.org/3/library/stdtypes.html#truth
[stdlib-bools]: https://docs.python.org/3/library/stdtypes.html#truth-value-testing
