# Instructions

In this exercise, you will write some code to help you prepare to buy a vehicle.

You have three tasks, one to determine if you will need to get a license, one to help you choose between two vehicles and one to estimate the acceptable price for a used vehicle.

## 1. Determine if you will need a drivers license

Some kinds of vehicles require a drivers license to operate them.
Assume only the kinds `'car'` and `'truck'` require a license, everything else can be operated without a license.

Implement the `needsLicense(kind)` function that takes the kind of vehicle and returns a boolean indicating whether you need a license for that kind of vehicle.

```javascript
needsLicense('car');
// => true

needsLicense('bike');
// => false
```

## 2. Choose between two potential vehicles to buy

You evaluate your options of available vehicles.
You manage to narrow it down to two options but you need help making the final decision.
For that implement the function `chooseVehicle(option1, option2)` that takes two vehicles as arguments and returns a decision that includes the option that comes first in dictionary order.

```javascript
chooseVehicle('Wuling Hongguang', 'Toyota Corolla');
// =>  'Toyota Corolla is clearly the better choice.'

chooseVehicle('Volkswagen Beetle', 'Volkswagen Golf');
// =>  'Volkswagen Beetle is clearly the better choice.'
```

## 3. Calculate an estimation for the price of a used vehicle

Now that you made your decision you want to make sure you get a fair price at the dealership.
Since you are interested in buying a used vehicle, the price depends on how old the vehicle is.
For a rough estimate, assume if the vehicle is less than 3 years old, it costs 80% of the original price it had when it was brand new.
If it is more than 10 years old, it costs 50%.
If the vehicle is at least 3 years old but not older than 10 years, it costs 70% of the original price.

Implement the `calculateResellPrice(originalPrice, age)` function that applies this logic using `if`, `else if` and `else` (there are other ways if you want to practice).
It takes the original price and the age of the vehicle as arguments and returns the estimated price in the dealership.

```javascript
calculateResellPrice(1000, 1);
// => 800

calculateResellPrice(1000, 5);
// => 700

calculateResellPrice(1000, 15);
// => 500
```

## Hints

## 1. Determine if you will need a drivers license

- Use the [strict equals operator][mdn-equality-operators] to check whether your input equals a certain string.
- Use one of the two [logical operators][mdn-logical-operators] you learned about in the boolean concept to combine the two requirements.
- You do **not** need an if-statement to solve this task. You can return the boolean expression you build directly.

## 2. Choose between two potential vehicles to buy

- Use a [relational operator][mdn-relational-operators] to determine which option comes first in dictionary order.
- Then set the value of a helper variable depending on the outcome of that comparison with the help of an [if-else statement][mdn-if-statement].
- Finally, construct the recommendation sentence. For that, you can use the [addition operator][mdn-addition] to concatenate the two strings.

## 3. Calculate an estimation for the price of a used vehicle

- Start with determining the percentage based on the age of the vehicle. Save it in a helper variable. Use an [if-else if-else statement][mdn-if-statement] as mentioned in the instructions.
- In the two if conditions, use [relational operators][mdn-relational-operators] to compare the car's age to the threshold values.
- To calculate the result, apply the percentage to the original price. For example, `30% of x` can be calculated by dividing `30` by `100` and multiplying with `x`.

[mdn-equality-operators]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators#equality_operators
[mdn-logical-operators]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators#binary_logical_operators
[mdn-relational-operators]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators#relational_operators
[mdn-addition]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Addition
[mdn-if-statement]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/if...else
