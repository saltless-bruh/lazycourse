# Instructions

In this exercise you'll be writing code to analyze the production in a car factory.

## 1. Calculate the number of working cars produced per hour

The cars are produced on an assembly line.
The assembly line has a certain speed, that can be changed.
The faster the assembly line speed is, the more cars are produced.
However, changing the speed of the assembly line also changes the number of cars that are produced successfully, that is cars without any errors in their production.

Implement a function that takes in the number of cars produced per hour and the success rate and calculates the number of successful cars made per hour.
The success rate is given as a percentage, from `0` to `100`:

```go
CalculateWorkingCarsPerHour(1547, 90)
// => 1392.3
```

**Note:** the return value should be a `float64`.

## 2. Calculate the number of working cars produced per minute

Implement a function that takes in the number of cars produced per hour and the success rate and calculates how many cars are successfully produced each minute:

```go
CalculateWorkingCarsPerMinute(1105, 90)
// => 16
```

**Note:** the return value should be an `int`.

## 3. Calculate the cost of production

Each car normally costs $10,000 to produce individually, regardless of whether it is successful or not.
But with a bit of planning, 10 cars can be produced together for $95,000.

For example, 37 cars can be produced in the following way:
37 = 3 x groups of ten + 7 individual cars

So the cost for 37 cars is:
3\*95,000+7\*10,000=355,000

Implement the function `CalculateCost` that calculates the cost of producing a number of cars, regardless of whether they are successful:

```go
CalculateCost(37)
// => 355000

CalculateCost(21)
// => 200000
```

**Note:** the return value should be an `uint`.

## Hints

## General

- To learn more about types in Go, check [Tour of Go: Basic Types][basic types].
- To learn more about type conversions in Go, check [Tour of Go: Type Conversions][type conversions].

## 1. Calculate the number of working cars produced per hour

- The percentage (passed as an argument) is a number between 0-100. To make this percentage a bit easier to work with, start by dividing it by 100.
- To compute the number of cars produced successfully, multiply the percentage (divided by 100) by the number of cars produced.
- When multiplying two numbers together, they both need to be of the same type.
  Use [type conversions][type conversions] if needed.

## 2. Calculate the number of working cars produced per minute

- Start by calculating the production of successful cars per hour.
  For this, you can use the `CalculateProductionRatePerHour` function you made from the previous step.
- Knowing the production per hour of cars, you can get the production per minute by dividing the production per hour by 60 (the number of minutes in an hour).
- Remember to cast the result to an `int`.

## 3. Calculate the cost of production

- Start by working out how many groups of 10 cars there are.
  You can do this by dividing the number of cars by 10.
- Then work out how many cars are remaining (the [modulo operator][modulo operator] is useful for this).
- To arrive at the cost, multiply the number of groups by the cost to produce 10 cars and then multiply the number of cars remaining by the cost to produce each individual car.
  Then sum the results of the multiplication together.

[basic types]: https://tour.golang.org/basics/11
[type conversions]: https://tour.golang.org/basics/13
[modulo operator]: https://golangbyexamples.com/remainder-modulus-go-golang/
