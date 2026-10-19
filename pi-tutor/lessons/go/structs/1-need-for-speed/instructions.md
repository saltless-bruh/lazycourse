# Instructions

In this exercise you'll be organizing races between various types of remote controlled cars.
Each car has its own speed and battery drain characteristics.

Cars start with full (100%) batteries.
Each time you drive the car using the remote control,
it covers the car's speed in meters and decreases the remaining battery percentage by its battery drain.

If a car's battery is below its battery drain percentage, you can't drive the car anymore.

Each race track has its own distance.
Cars are tested by checking if they can finish the track without running out of battery.

## 1. Create a remote controlled car

Define a `Car` struct with the following `int` type fields:

- battery
- batteryDrain
- speed
- distance

Allow creating a remote controlled car by defining a function `NewCar` that takes the speed of the car in meters,
and the battery drain percentage as its two parameters (both of type `int`) and returns a `Car` instance:

```go
speed := 5
batteryDrain := 2
car := NewCar(speed, batteryDrain)
// => Car{speed: 5, batteryDrain: 2, battery:100, distance: 0}
```

## 2. Create a race track

Define another struct type called `Track` with the field `distance` of type integer.
Allow creating a race track by defining a function `NewTrack` that takes the track's distance in meters as its sole parameter (which is of type `int`):

```go
distance := 800
track := NewTrack(distance)
// => Track{distance: 800}
```

## 3. Drive the car

Implement the `Drive` function that updates the number of meters driven based on the car's speed, and reduces the battery according to the battery drainage.
If there is not enough battery to drive one more time the car will not move:

```go
speed := 5
batteryDrain := 2
car := NewCar(speed, batteryDrain)
car = Drive(car)
// => Car{speed: 5, batteryDrain: 2, battery: 98, distance: 5}
```

## 4. Check if a remote controlled car can finish a race

To finish a race, a car has to be able to drive the race's distance.
This means not draining its battery before having crossed the finish line.
Implement the `CanFinish` function that takes a `Car` and a `Track` instance as its parameter and returns `true` if the car can finish the race; otherwise, return `false`.

Assume that you are currently at the starting line of the race and start the engine of the car for the race.
Take into account that the car's battery might not necessarily be fully charged when starting the race:

```go
speed := 5
batteryDrain := 2
car := NewCar(speed, batteryDrain)

distance := 100
track := NewTrack(distance)

CanFinish(car, track)
// => true
```

## Hints

## General

- A `struct` is a sequence of named elements, called fields, each one having a name and a type.

## 1. Create a remote controlled car

- Instantiate a new [struct][struct] and fill the fields except `distance`.
- Create a function that returns the type of the newly created struct and update the fields accordingly

## 2. Create a race track

- Define a new [struct][struct] with 1 field
- Create a function that returns the type of the new created struct and updates the fields accordingly

## 3. Drive the car

- Add a new field to keep track of the distance driven
- You need to check if there is enough battery to drive the car

## 4. Check if a remote controlled car can finish a race

- Assume the car is just starting the race
- You need to calculate the maximum distance a car can drive with the current level of battery
- The number of times a car can be driven can be calculated by `battery / batteryDrain`.
- The maximum distance the car can cover is the product of the car's speed and the number of times it can be driven.
- Knowing the maximum distance the car can drive, compare it with the distance of the race track

[struct]: https://tour.golang.org/moretypes/2
