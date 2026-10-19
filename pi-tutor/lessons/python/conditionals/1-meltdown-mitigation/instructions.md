# Instructions

In this exercise, we'll develop a simple control system for a nuclear reactor.

For a reactor to produce the power it must be in a state of _criticality_.
If the reactor is in a state less than criticality, it can become damaged.
If the reactor state goes beyond criticality, it can overload and result in a meltdown.
We want to mitigate the chances of meltdown and correctly manage reactor state.

The following three tasks are all related to writing code for maintaining ideal reactor state.

## 1. Check for criticality

The first thing a control system has to do is check if the reactor is _balanced in criticality_.
A reactor is said to be balanced in criticality if it satisfies the following conditions:

- The temperature is less than 800 K.
- The number of neutrons emitted per second is greater than 500.
- The product of temperature and neutrons emitted per second is less than 500000.

Implement the function `is_criticality_balanced()` that takes `temperature` measured in kelvin and `neutrons_emitted` as parameters, and returns `True` if the criticality conditions are met, `False` if not.

```python
>>> is_criticality_balanced(750, 600)
True
```

## 2. Determine the Power output range

Once the reactor has started producing power its efficiency needs to be determined.
Efficiency can be grouped into 4 bands:

1. `green` -> efficiency of 80% or more,
2. `orange` -> efficiency of less than 80% but at least 60%,
3. `red` -> efficiency below 60%, but still 30% or more,
4. `black` ->  less than 30% efficient.

The percentage value can be calculated as `(generated_power/theoretical_max_power)*100`
where `generated_power` = `voltage` * `current`.
Note that the percentage value is usually not an integer number, so make sure to consider the
proper use of the `<` and `<=` comparisons.

Implement the function `reactor_efficiency(<voltage>, <current>, <theoretical_max_power>)`, with three parameters: `voltage`,
`current`, and `theoretical_max_power`.
This function should return the efficiency band of the reactor : 'green', 'orange', 'red', or 'black'.

```python
>>> reactor_efficiency(200,50,15000)
'orange'
```

## 3. Fail Safe Mechanism

Your final task involves creating a fail-safe mechanism to avoid overload and meltdown.
This mechanism will determine if the reactor is below, at, or above the ideal criticality threshold.
Criticality can then be increased, decreased, or stopped by inserting (or removing) control rods into the reactor.

Implement the function called `fail_safe()`, which takes 3 parameters: `temperature` measured in kelvin,
`neutrons_produced_per_second`, and `threshold`, and outputs a status code for the reactor.

- If `temperature * neutrons_produced_per_second` < 90% of `threshold`, output a status code of 'LOW'
  indicating that control rods must be removed to produce power.

- If the value `temperature * neutrons_produced_per_second` is within 10% of the `threshold` (so either 0-10% less than the threshold, at the threshold, or 0-10% greater than the threshold), the reactor is in _criticality_ and the status code of 'NORMAL' should be output, indicating that the reactor is in optimum condition and control rods are in an ideal position.

- If `temperature * neutrons_produced_per_second` is not in the above-stated ranges, the reactor is
  going into meltdown and a status code of 'DANGER' must be passed to immediately shut down the reactor.

```python
>>> fail_safe(temperature=1000, neutrons_produced_per_second=30, threshold=5000)
'DANGER'
```

## Hints

## General

- The Python Docs on [Control Flow Tools][control flow tools] and the Real Python tutorial on [conditionals][real python conditionals] are great places to start.
- The Python Docs on [Boolean Operations][boolean operations] can be a great refresher on `bools`, as can the Real Python tutorial on [booleans][python booleans].
- The Python Docs on [Comparisons][comparisons] and [comparisons examples][python comparisons examples] can be a great refresher for comparisons.

## 1. Check for criticality

- Comparison operators ([comparisons][comparisons review]) and boolean operations ([concept:python/bools]()) can be combined and used with conditionals.
- Conditional expressions must evaluate to `True` or `False`.
- `else` can be used for a code block that will execute when all conditional tests return `False`.

  ```python
     >>> item = 'blue'
     >>> item_2 = 'green'
     
     >>>  if len(item) >= 3 and len(item_2) < 5:
            print('Both pass the test!')
          elif len(item) >= 3 or len(item_2) < 5:
            print('One passes the test!')
          else:
            print('None pass the test!')
    ...
    One passes the test!
  ```

## 2. Determine the Power output range

- Comparison operators can be combined and used with conditionals.
- Any number of `elif` statements can be used as decision "branches".
- Each "branch" can have a separate `return`, although it might be considered "bad form" by linting tools.
- If the linter complains, consider assigning the output of a branch to a common variable, and then `return`ing that variable.

## 3. Fail Safe Mechanism

- Comparison operators can be combined and used with conditionals.
- Any number of `elif` statements can be used as decision "branches".
- Each "branch" can have a separate `return`, although it might be considered "bad form" by linting tools.
- If the linter complains, consider assigning the output of a branch to a common variable, and then `return`ing that variable.


[boolean operations]: https://docs.python.org/3/library/stdtypes.html#boolean-operations-and-or-not
[comparisons review]: https://www.learnpython.dev/02-introduction-to-python/090-boolean-logic/20-comparisons/
[comparisons]: https://docs.python.org/3/library/stdtypes.html#comparisons
[control flow tools]: https://docs.python.org/3/tutorial/controlflow.html
[python booleans]: https://realpython.com/python-boolean/
[python comparisons examples]: https://www.tutorialspoint.com/python/comparison_operators_example.htm
[real python conditionals]: https://realpython.com/python-conditional-statements/
