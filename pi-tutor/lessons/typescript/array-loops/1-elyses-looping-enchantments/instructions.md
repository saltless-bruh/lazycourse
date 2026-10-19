# Instructions

As a budding magician, Elyse needs to analyze her deck in lots of different ways.
To keep things simple, she only uses cards with values 1-10.

## 1. Determine how many cards of a certain type are in the deck

Elyse wants to know how many cards of a particular type she has in her deck.

Write a function `cardTypeCheck` that takes two parameters: an array of cards (Elyse's deck) and the type of card to count.

<!--prettier-ignore -->
~~~exercism/note
The function should use `forEach` and return the number of cards in the deck of the specified type.
~~~

```javascript
const cardType = 3;
cardTypeCheck([1, 2, 3, 4], cardType);
// => 1
```

## 2. Determine how many odd or even cards there are

For another trick, Elyse needs to know how many odd or even cards there are in her deck.

Implement a function `determineOddEvenCards` that takes in two parameters: an array of cards (Elyse's deck), and a boolean (true is analogous to 'even', and false is analogous to 'odd').

This function should return a single number: the number of odd or even cards there are (depending on the value of the second argument) in the deck.

<!--prettier-ignore -->
~~~exercism/note
To practice, use a `for...of` loop in the function implementation this time.
~~~

```javascript
determineOddEvenCards([1, 2, 3, 1, 5, 6], true);
// => 2

determineOddEvenCards([1, 2, 3, 1, 5, 6], false);
// => 4
```

## Hints

## 1. Determine how many cards of a certain type are in the deck

- First, set up an integer variable to track the number of cards for the given type.
- Then as mentioned in the instructions, use [forEach][mdn-foreach] to iterate over the deck.
- Increase your counter variable in the callback when you find a card of the desired type.

## 2. Determine how many odd or even cards there are

- First, set up an integer variable to track the number of cards for the desired type (odd or even).
- Then as mentioned in the instructions, use [for...of][mdn-for-of] to iterate over the deck.
- The remainder when dividing by 2 tells you whether a number is odd or even.
  You can calculate the remainder using the [modulo operator][mdn-modulo] `%`.
- Increase your counter variable when you visit a number with the desired remainder.

[mdn-foreach]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/forEach
[mdn-for-of]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for...of
[mdn-modulo]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Remainder
