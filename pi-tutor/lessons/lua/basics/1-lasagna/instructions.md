# Instructions

In this instruction you are going to write some code to help you cook a lasagna from your favorite cooking book.

You have four tasks, all related to cooking your recipe.

## 1. Define the expected oven time in minutes

Define the `lasagna.oven_time` table field with how many minutes the lasagna should be in the oven. According to the cooking book, the expected oven time in minutes is 40:

```lua
lasagna.oven_time
-- => 40
```

## 2. Calculate the remaining oven time in minutes

Define the `lasagna.remaining_oven_time` function that takes the actual minutes the lasagna has been in the oven as an argument and returns how many minutes the lasagna still has to remain in the oven, based on the expected oven time in minutes from the previous task.

```lua
lasagna.remaining_oven_time(30)
-- => 10
```

## 3. Calculate the preparation time in minutes

Define the `lasagna.preparation_time` function that takes the number of layers you added to the lasagna as a argument and returns how many minutes you spent preparing the lasagna, assuming each layer takes you 2 minutes to prepare.

```lua
lasagna.preparation_time(2)
-- => 4
```

## 4. Calculate the elapsed working time in minutes

Define the `lasagna.elapsed_time` function that takes two arguments: the first argument is the number of layers you added to the lasagna, and the second argument is the number of minutes the lasagna has been in the oven. The function should return how many minutes in total you've worked on cooking the lasagna, which is the sum of the preparation time in minutes and the time in minutes the lasagna has spent in the oven at the moment.

```lua
lasagna.elapsed_time(3, 20)
-- => 26
```

## Hints

## 1. Define the expected oven time in minutes

* You need to add a new entry to the table `lasagna` with the key `oven_time` and the expacted oven time in minutes.
* The value has to be a number.

## 2. Calculate the remaining oven time in minutes

* You need to write the body for the function `remaining_oven_time`.
* You need to return a number.
* You can use the [arithmetic operator](https://www.lua.org/manual/5.4/manual.html#3.4.1) for substraction.

## 3. Calculate the preparation time in minutes

* You need to write the body for the function `preparation_time`.
* You need to return a number.
* You can use the [arithmetic operator](https://www.lua.org/manual/5.4/manual.html#3.4.1) for multiplication.

## 4. Calculate the elapsed working time in minutes

* You need to write the body for the function `elapsed_time`.
* You need to return a number.
* You can [call](https://www.lua.org/manual/5.4/manual.html#3.4.10) one of the other functions you've defined previously.
* You can use the [arithmetic operator](https://www.lua.org/manual/5.4/manual.html#3.4.1) for addition.
