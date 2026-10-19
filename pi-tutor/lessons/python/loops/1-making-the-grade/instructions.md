# Instructions

You're a teaching assistant correcting student exams.
Keeping track of results manually is getting both tedious and mistake-prone.
You decide to make things a little more interesting by putting together some functions to count and calculate results for the class.

## 1. Rounding Scores

While you can give "partial credit" on exam questions, overall exam scores have to be `int`s.
So before you can do anything else with the class scores, you need to go through the grades and turn any `float` scores into `int`s. Lucky for you, Python has the built-in [`round()`][round] function you can use.

Create the function `round_scores(student_scores)` that takes a `list` of `student_scores`.
This function should _consume_ the input `list` and `return` a new list with all the scores converted to `int`s.
The order of the scores in the resulting `list` is not important.

```python
>>> student_scores = [90.33, 40.5, 55.44, 70.05, 30.55, 25.45, 80.45, 95.3, 38.7, 40.3]
>>> round_scores(student_scores)
...
[40, 39, 95, 80, 25, 31, 70, 55, 40, 90]
```

## 2. Non-Passing Students

As you were grading the exam, you noticed some students weren't performing as well as you had hoped.
But you were distracted, and forgot to note exactly _how many_ students.

Create the function `count_failed_students(student_scores)` that takes a `list` of `student_scores`.
This function should count up the number of students who don't have passing scores and return that count as an integer.
A student needs a score greater than **40** to achieve a passing grade on the exam.

```python
>>> count_failed_students(student_scores=[90,40,55,70,30,25,80,95,38,40])
5
```

## 3. The "Best"

The teacher you're assisting wants to find the group of students who've performed "the best" on this exam.
What qualifies as "the best" fluctuates, so you need to find the student scores that are **greater than or equal to** the current threshold.

Create the function `above_threshold(student_scores, threshold)` taking `student_scores` (a `list` of grades), and `threshold` (the "top score" threshold) as parameters.
This function should return a `list` of all scores that are `>=` to `threshold`.

```python
>>> above_threshold(student_scores=[90,40,55,70,30,68,70,75,83,96], threshold=75)
[90,75,83,96]
```

## 4. Calculating Letter Grades

The teacher you are assisting likes to assign letter grades as well as numeric scores.
Since students rarely score 100 on an exam, the "letter grade" lower thresholds are calculated based on the highest score achieved, and increment evenly between the high score and the failing threshold of **<= 40**.

Create the function `letter_grades(highest)` that takes the "highest" score on the exam as an argument, and returns a `list` of lower score thresholds for each "American style" grade interval: `["D", "C", "B", "A"]`.


```python
"""Where the highest score is 100, and failing is <= 40.
       "F" <= 40
 41 <= "D" <= 55
 56 <= "C" <= 70
 71 <= "B" <= 85
 86 <= "A" <= 100
"""

>>> letter_grades(highest=100)
[41, 56, 71, 86]


"""Where the highest score is 88, and failing is <= 40.
       "F" <= 40
 41 <= "D" <= 52
 53 <= "C" <= 64
 65 <= "B" <= 76
 77 <= "A" <= 88
"""

>>> letter_grades(highest=88)
[41, 53, 65, 77]
```

## 5. Matching Names to Scores

You have a list of exam scores in descending order, and another list of student names also sorted in descending order by their exam scores.
You would like to match each student name with their exam score and print out an overall class ranking.

Create the function `student_ranking(student_scores, student_names)` with parameters `student_scores` and `student_names`.
Match each student name on the student_names `list` with their score from the student_scores `list`.
You can assume each argument `list` will be sorted from highest score(er) to lowest score(er).
The function should return a `list` of strings with the format `<rank>. <student name>: <student score>`.

```python
>>> student_scores = [100, 99, 90, 84, 66, 53, 47]
>>> student_names =  ['Joci', 'Sara','Kora','Jan','John','Bern', 'Fred']
>>> student_ranking(student_scores, student_names)
...
['1. Joci: 100', '2. Sara: 99', '3. Kora: 90', '4. Jan: 84', '5. John: 66', '6. Bern: 53', '7. Fred: 47']
```

## 6. A "Perfect" Score

Although a "perfect" score of 100 is rare on an exam, it is interesting to know if at least one student has achieved it.

Create the function `perfect_score(student_info)` with parameter `student_info`.
`student_info` is a `list` of lists containing the name and score of each student: `[["Charles", 90], ["Tony", 80]]`.
The function should `return` _the first_ `[<name>, <score>]` pair of the student who scored 100 on the exam.

If no 100 scores are found in `student_info`, an empty list `[]` should be returned.

```python
>>> perfect_score(student_info=[["Charles", 90], ["Tony", 80], ["Alex", 100]])
["Alex", 100]

>>> perfect_score(student_info=[["Charles", 90], ["Tony", 80]])
[]
```

[round]: https://docs.python.org/3/library/functions.html#round

## Hints

## General

- [`while`][while-loops] loops are used for _indefinite_ (uncounted) iteration.
- [`for`][for-loops] loops are used for _definite_ (counted) iteration.
- The keywords [`break` and `continue`][control flow] help customize loop behavior.
- [`range(<start>, <stop>, <step>)`][range] can be used to generate a sequence for a loop counter.
- The built-in [`enumerate()`][enumerate] will return (`<value>`, `<index>`) pairs to iterate over.

Also being familiar with the following can help with completing the tasks:

- [`lists`][list]: indexing, nested lists, [`<list>.append()`][append and pop], [`<list>.pop()`][append and pop].
- [`str`][str]: `str()` constructor, using the `+` to concatenate strings, optionally, [`f-strings`][f-strings].

## 1. Rounding Scores

- `While` loops will continue to execute until their test condition evaluates to `False`.
- `<list>.pop()` will remove and return the last item in a `list`.
- Empty lists evaluate to `False` (most empty objects in Python are "Falsy")

## 2. Non-Passing Students

- There's no need to declare `loop` counters or `index` counters when iterating through an object using a `for` loop.
- A results counter does need to be set up and _incremented_ — you'll want to `return` the count of non-passing students when the loop terminates.

## 3. The "Best"

- There's no need to declare `loop` counters or `index` counters when iterating through an object using a `for` loop.
- Having an empty `list` to add the "best" marks to is helpful here.
- `<list>.append()` can help add things to the results `list`.

## 4. Calculating Letter Grades

- These are _lower thresholds_.  The _lower threshold_ for a "D" is a score of **41**, since an "F" is **<= 40**.
- [`range()`][range] can be helpful here to generate a sequence with the proper "F" -> "A" increments.
- [`round()`][round] without parameters should round off increments nicely.
- As with "the best" task, `<list>.append()` could be useful here to append items from `range()` into a results `list`.

## 5. Matching Names to Scores

- [`enumerate()`][enumerate] could be helpful here.
- If both lists are the same length and sorted the same way, could you use the `index` from one to retrieve a `value` from the other?

## 6. A "Perfect" Score

- There may be or may not be a student with a score of 100, and you can't return `[]` without checking **all** scores.
- The [`control flow`][control flow] statements `continue` and `break` may be useful here to move past unwanted values.

[append and pop]: https://docs.python.org/3/tutorial/datastructures.html#more-on-lists
[control flow]: https://docs.python.org/3/tutorial/controlflow.html#break-and-continue-statements-and-else-clauses-on-loops
[enumerate]: https://docs.python.org/3/library/functions.html#enumerate
[f-strings]: https://docs.python.org/3/reference/lexical_analysis.html#formatted-string-literals
[for-loops]: https://docs.python.org/3/tutorial/controlflow.html#for-statements
[list]: https://docs.python.org/3/library/stdtypes.html#list
[range]: https://docs.python.org/3/tutorial/controlflow.html#the-range-function
[round]: https://docs.python.org/3/library/functions.html#round
[str]: https://docs.python.org/3/library/stdtypes.html#str
[while-loops]: https://docs.python.org/3/reference/compound_stmts.html#the-while-statement
