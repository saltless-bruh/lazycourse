# Instructions

You're going to write some code to help you cook a gorgeous lasagna from your favorite cookbook.

You have five tasks, all related to cooking your recipe.

<br>

~~~~exercism/note
We have started the first function definition for you in the stub file, but you will need to write the remaining function definitions yourself.
You will also need to define any constants yourself.
Read the #TODO comment lines in the stub file carefully.
Once you are done with a task, remove the TODO comment.
~~~~

<br>

## 1. Define expected bake time in minutes as a constant

Define the `EXPECTED_BAKE_TIME` [constant][constants] that represents how many minutes the lasagna should bake in the oven.
According to your cookbook, the Lasagna should be in the oven for 40 minutes:

```python
>>> print(EXPECTED_BAKE_TIME)
40
```

## 2. Calculate remaining bake time in minutes

Complete the `bake_time_remaining()` function that takes the actual minutes the lasagna has been in the oven as an argument and returns how many minutes the lasagna still needs to bake based on the `EXPECTED_BAKE_TIME` constant.

```python
>>> bake_time_remaining(30)
10
```


## 3. Calculate preparation time in minutes

Define the `preparation_time_in_minutes()` [function][functions] that takes the `number_of_layers` you want to add to the lasagna as an argument and returns how many minutes you would spend making them.
Assume each layer takes 2 minutes to prepare.

```python
>>> def preparation_time_in_minutes(number_of_layers):
        ...
        ...
        
>>> preparation_time_in_minutes(2)
4
```


## 4. Calculate total elapsed time (prepping + baking) in minutes

Define the `elapsed_time_in_minutes()` function that takes two parameters as arguments:

- `number_of_layers` (_the number of layers added to the lasagna_)
- `elapsed_bake_time` (_the number of minutes the lasagna has spent baking in the oven already_).

This function should return the total minutes you have been in the kitchen cooking — your preparation time layering +
the time the lasagna has spent baking in the oven.


```python
>>> def elapsed_time_in_minutes(number_of_layers, elapsed_bake_time):
        ...
        ...
        
>>> elapsed_time_in_minutes(3, 20)
26
```


## 5. Update the recipe with notes

Go back through the recipe, adding "notes" in the form of [function docstrings][function-docstrings].

```python
def elapsed_time_in_minutes(number_of_layers, elapsed_bake_time):
    """Calculate the elapsed cooking time.
    
    Parameters:
        number_of_layers (int): The number of layers in the lasagna.
        elapsed_bake_time (int): Time the lasagna has been baking in the oven.
    
    Returns:
        int: The total time elapsed (in minutes) preparing and baking.

    This function takes two integers representing the number of lasagna 
    layers and the time already spent baking the lasagna. It calculates 
    the total elapsed minutes spent cooking (preparing + baking).
    
    """
```

[constants]: https://stackoverflow.com/a/2682752
[functions]: https://docs.python.org/3/tutorial/controlflow.html#defining-functions
[function-docstrings]: https://docs.python.org/3/tutorial/controlflow.html#documentation-strings

## Hints

## General

- [The Python Tutorial][the python tutorial] can be a great introduction.
- [PEP 8][pep8] is the Python code style guide.
- [PEP 257][PEP257] details Python docstring conventions.
- [Numbers][numbers] in Python can be integers, floats, or complex.


## 1. Define expected bake time in minutes

- You need to [name][naming] a [constant][constants], and [assign][assignment] it an [integer][numbers] value.
  This constant should be the first thing after the docstring that is at the top of the file.
  Remember to remove the #TODO comment after defining the constant.

## 2. Calculate remaining bake time in minutes

- You need to define a [function][defining functions] with a single parameter representing the time elapsed so far.
- Use the [mathematical operator for subtraction][numbers] to subtract values.
- This function should [return a value][return].

## 3. Calculate preparation time in minutes

- You need to define a [function][defining functions] with a single parameter representing the number of layers.
- Use the [mathematical operator for multiplication][numbers] to multiply values.
- You can define a PREPARATION_TIME _constant_ for the time in minutes per layer rather than using a ["magic
  number"][magic-numbers] in your code.
- This function should [return a value][return].

## 4. Calculate total elapsed cooking time (prep + bake) in minutes

- You need to define a [function][defining functions] with two parameters.
- Remember: you can always _call_ a function you've defined previously.
- You can use the [mathematical operator for addition][python as a calculator] to sum values.
- This function should [return a value][return].

## 5. Update the recipe with notes

- Clearly [commenting][comments] and [documenting][docstrings] your code according to [PEP257][pep257] is always recommended.
- Some examples of Google-style docstrings can be found in the Sphinx documentation for the [napoleon module][napoleon].

[assignment]: https://docs.python.org/3/reference/simple_stmts.html#grammar-token-assignment-stmt
[comments]: https://realpython.com/python-comments-guide/
[constants]: https://stackoverflow.com/a/2682752
[defining functions]: https://docs.python.org/3/tutorial/controlflow.html#defining-functions
[docstrings]: https://docs.python.org/3/tutorial/controlflow.html#tut-docstrings
[magic-numbers]: https://en.wikipedia.org/wiki/Magic_number_(programming)
[naming]: https://realpython.com/python-variables/
[napoleon]: https://www.sphinx-doc.org/en/master/usage/extensions/napoleon.html#module-sphinx.ext.napoleon
[numbers]: https://docs.python.org/3/tutorial/introduction.html#numbers
[pep8]: https://www.python.org/dev/peps/pep-0008/
[pep257]: https://www.python.org/dev/peps/pep-0257/
[python as a calculator]: https://docs.python.org/3/tutorial/introduction.html#using-python-as-a-calculator
[return]: https://docs.python.org/3/reference/simple_stmts.html#return
[the python tutorial]: https://docs.python.org/3/tutorial/introduction.html
