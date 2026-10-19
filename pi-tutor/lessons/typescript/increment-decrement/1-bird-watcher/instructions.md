# Instructions

You are an avid bird watcher that keeps track of how many birds have visited your garden.
Usually, you use a tally in a notebook to count the birds but you want to better work with your data.
You already digitalized the bird counts per day for the past weeks that you kept in the notebook.

Now you want to determine the total number of birds that you counted, calculate the bird count for a specific week and correct a counting mistake.

<!-- prettier-ignore -->
~~~~exercism/note
To practice, use a `for` loop to solve each of the tasks below.
~~~~

## 1. Determine the total number of birds that you counted so far

Let us start analyzing the data by getting a high-level view.
Find out how many birds you counted in total since you started your logs.

Implement a function `totalBirdCount` that accepts an array-like object that contains the bird count per day.
It should return the total number of birds that you counted.

```javascript
birdsPerDay = [2, 5, 0, 7, 4, 1, 3, 0, 2, 5, 0, 1, 3, 1];
totalBirdCount(birdsPerDay);
// => 34
```

## 2. Calculate the number of visiting birds in a specific week

Now that you got a general feel for your bird count numbers, you want to make a more fine-grained analysis.

Implement a function `birdsInWeek` that accepts an array-like object of bird counts per day and a week number.
It returns the total number of birds that you counted in that specific week.
You can assume weeks are always tracked completely.

```javascript
birdsPerDay = [2, 5, 0, 7, 4, 1, 3, 0, 2, 5, 0, 1, 3, 1];
birdsInWeek(birdsPerDay, 2);
// => 12
```

## 3. Fix a counting mistake

You realized that all the time you were trying to keep track of the birds, there was one hiding in a far corner of the garden.
You figured out that this bird always spent every second day in your garden.
You do not know exactly where it was in between those days but definitely not in your garden.
Your bird watcher intuition also tells you that the bird was in your garden on the first day that you tracked in your list.

Given this new information, write a function `fixBirdCountLog` that takes an array-like object of birds counted per day as an argument. It should correct the counting mistake by modifying the given array.

```javascript
birdsPerDay = [2, 5, 0, 7, 4, 1];
fixBirdCountLog(birdsPerDay);
// => [3, 5, 1, 7, 5, 1]
```

## Hints

## 1. Determine the total number of birds that you counted so far

- Refer to the exercise introduction for an example of how to use a for loop to iterate over an array.
- Use a helper variable to store the total count and increase that variable as you go through the array.
- Think about the correct initial value for that helper variable.
- Refer back to the [array concept][concept-arrays] to recap how to retrieve values from an array.

## 2. Calculate the number of visiting birds in a specific week

- This task is similar to the first one.
  You can copy your code as a starting point.
- Think about which indexes in the array you would need to take into account for week number 1 and 2, respectively.
- Now, find a general way to calculate the first and the last index that should be considered.
- With that, you can set up the for loop to only iterate over the relevant section of the array.

## 3. Fix a counting mistake

- Again, you need to set up a for loop to iterate over the whole bird count array.
- This time you only need to visit every second entry in the array.
- Change the step so the counter variable is increased accordingly after each iteration.
- In the body of the for loop you can use the increment operator to change the value of an element in an array in place.

[concept-arrays]: /tracks/javascript/concepts/arrays
