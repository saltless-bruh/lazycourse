# Instructions

Elaine is working on a new children's game that features animals and magic wands.
It is time to code functions for rolling a die, generating random wand energy and shuffling a slice.

## 1. Roll a die

Implement a `RollADie` function.

This will be the traditional twenty-sided die with numbers 1 to 20.

```go
d := RollADie() // d will be assigned a random int, 1 <= d <= 20
```

## 2. Generate wand energy

Implement a `GenerateWandEnergy` function.
The wand energy should be a random floating point number equal or greater than 0.0 and less than 12.0.

```go
f := GenerateWandEnergy()  // f will be assigned a random float64, 0.0 <= f < 12.0
```

## 3. Shuffle a slice

The game features eight different animals:

- ant
- beaver
- cat
- dog
- elephant
- fox
- giraffe
- hedgehog

Write a function `ShuffleAnimals` that returns a slice with the eight animals in random order.

## Hints

## General

This [article][gobyexample] gives a nice introduction to package `math/rand`.

If you are working locally and use Go 1.19 or lower, make sure to seed your random number generator with the current time.

## 1. Roll a die

This [article][yourbasic] shows how to generate integers in a certain range.

## 2. Generate wand energy

Function [rand.Float64][float64] returns a random `float64` number between 0.0 and 1.0.

## 3. Shuffle a slice

Create a slice with the eight animal strings, then call [rand.Shuffle][shuffle] to put it into a random order.

[gobyexample]: https://gobyexample.com/random-numbers
[yourbasic]: https://yourbasic.org/golang/generate-number-random-range
[shuffle]: https://pkg.go.dev/math/rand#Rand.Shuffle
[float64]: https://pkg.go.dev/math/rand#Float64
