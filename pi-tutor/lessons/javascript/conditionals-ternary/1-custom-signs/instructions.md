# Instructions

In this exercise you'll be writing code to help a sign company create custom messages for their signs.

## 1. Build an occasion sign

Implement the function `buildSign(occasion, name)` that accepts a string as the `occasion` parameter and a string holding someone's name as the `name` parameter.
The two parameters will be embedded into a template string to output the message on the sign.

```javascript
buildSign('Birthday', 'Rob');
// => "Happy Birthday Rob!"
```

## 2. Build a birthday sign

Implement the function `buildBirthdaySign(age)` that accepts an age and based on the age will determine part of the message on the sign.
If the age is 50 or older, the sign will refer user as _mature_, else it will refer them as _young_.
The exact expected output is shown below:

```javascript
buildBirthdaySign(50);
// => "Happy Birthday! What a mature fellow you are."

buildBirthdaySign(45);
// => "Happy Birthday! What a young fellow you are."
```

## 3. Build a graduation sign

Implement the function `graduationFor(name, year)` which takes a name as a string parameter and a year as a number parameter and uses string interpolation to create a phrase for a sign that uses a newline to separate the two lines of the message.

```javascript
graduationFor('Hannah', 2022);
/* => "Congratulations Hannah!
       Class of 2022"
*/
```

## 4. Compute the cost of a sign

Implement the function `costOf(sign, currency)` which takes a string that holds the contents of the sign and a string that represents the currency.
The sign has a base price of 20 in the given currency. Additionally each letter costs 2. (Whitespaces are included in the calculation.)
The phrase returned includes the cost to create the sign, written with two digits after the decimal point, followed by the currency string.

```javascript
costOf('Happy Birthday Rob!', 'dollars');
// => "Your sign costs 58.00 dollars."
```

## Hints

## 1. Build an occasion sign

- [template strings][mdn-template-strings] (Template literals) allow for substitution of one or more strings and embedded expressions

## 2. Build a birthday sign

- [template strings][mdn-template-strings] (Template literals) allow for substitution of strings and embedded expressions
- [ternary operator][mdn-ternary-operator] is a short-hand way of operating on conditions, similar to `if/else`. It can be easier to use in template strings because it is condensed.

## 3. Build a graduation sign

- [template strings][mdn-template-strings] allow strings to span onto multiple lines.

## 4. Compute the cost of a sign

- Figure out the [`length`][mdn-string-length] of the characters.
- Only show the first two decimal numbers using [fixed-point][mdn-to-fixed] notation.

[mdn-const]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/const
[mdn-template-strings]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals
[mdn-string-length]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/length
[mdn-to-fixed]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/toFixed
[mdn-ternary-operator]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Conditional_Operator
