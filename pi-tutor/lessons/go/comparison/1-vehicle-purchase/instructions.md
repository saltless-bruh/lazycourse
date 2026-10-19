# Instructions

In this exercise, you are going to write some code to help you prepare to buy a vehicle.

You have three tasks, one to determine if you need a license, one to help you choose between two vehicles and one to estimate the acceptable price for a used vehicle.

## 1. Determine if you will need a driver's license

Some vehicle kinds require a driver's license to operate them.
Assume only the kinds `"car"` and `"truck"` require a license, everything else can be operated without a license.

Implement the `NeedsLicense(kind)` function that takes the kind of vehicle and returns a boolean indicating whether you need a license for that kind of vehicle.

```go
needLicense := NeedsLicense("car")
// => true

needLicense = NeedsLicense("bike")
// => false

needLicense = NeedsLicense("truck")
// => true
```

## 2. Choose between two potential vehicles to buy

You evaluate your options of available vehicles.
You manage to narrow it down to two options but you need help making the final decision.
For that, implement the function `ChooseVehicle(option1, option2)` that takes two vehicles as arguments and returns a decision that includes the option that comes first in lexicographical order.

```go
vehicle := ChooseVehicle("Wuling Hongguang", "Toyota Corolla")
// => "Toyota Corolla is clearly the better choice."

ChooseVehicle("Volkswagen Beetle", "Volkswagen Golf")
// => "Volkswagen Beetle is clearly the better choice."
```

## 3. Calculate an estimation for the price of a used vehicle

Now that you made a decision, you want to make sure you get a fair price at the dealership.
Since you are interested in buying a used vehicle, the price depends on how old the vehicle is.
For a rough estimate, assume if the vehicle is less than 3 years old, it costs 80% of the original price it had when it was brand new.
If it is at least 10 years old, it costs 50%.
If the vehicle is at least 3 years old but less than 10 years, it costs 70% of the original price.

Implement the `CalculateResellPrice(originalPrice, age)` function that applies this logic using `if`, `else if` and `else` (there are other ways if you want to practice).
It takes the original price and the age of the vehicle as arguments and returns the estimated price in the dealership.

```go
CalculateResellPrice(1000, 1)
// => 800

CalculateResellPrice(1000, 5)
// => 700

CalculateResellPrice(1000, 15)
// => 500
```

**Note** the return value is a `float64`.

## Hints

## 1. Determine if you will need a driver's license

- Use the [equals comparison operator][comparison-operators] to check whether your input equals a certain string.
- Use one of the two [logical operators][logical-operators] you learned about in the boolean concept to combine the two requirements.
- You do **not** need an if-statement to solve this task.
  You can return the boolean expression you build directly.

## 2. Choose between two potential vehicles to buy

- Use a [comparison operator][comparison-operators] to determine which option comes first in lexicographical order.
- Then set the value of a helper variable depending of the outcome of that comparison with the help of an an [if-else statement][if-statement].
- Finally construct the recommendation sentence.
  For that you can use the `+` operator to concatenate the two strings.

## 3. Calculate an estimation for the price of a used vehicle

- Start with determining the percentage of the original price based on the age of the vehicle.
  Save it in a helper variable.
  Use an [if-else if-else statement][if-statement] as mentioned in the instructions.
- In the two if conditions use [comparison operators][comparison-operators] to compare the age of the car to the threshold values.
- To calculate the result, apply the percentage to the original price.
  For example `30% of x` can be calculated by dividing `30` by `100` and multiplying with `x`.

[comparison-operators]: https://golang.org/ref/spec#Comparison_operators
[logical-operators]: https://golang.org/ref/spec#Logical_operators
[if-statement]: https://golang.org/ref/spec#If_statements
