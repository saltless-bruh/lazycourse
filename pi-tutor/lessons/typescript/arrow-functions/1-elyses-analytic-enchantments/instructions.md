# Instructions

Elyse, magician-to-be, continues her training. She will be given several stacks of cards that she needs to perform her tricks.
To make things a bit easier, she only uses the cards 1 to 10.

In this exercise, use built-in methods to analyse the contents of an array.

## 1. Find the position of a card

Elyse wants to know the position (index) of a card in the stack.

```javascript
const card = 2;
getCardPosition([9, 7, 3, 2], card);
// => 3
```

## 2. Determine if a card is present

Elyse wants to determine if a card is present in the stack -- in other words, if the stack contains a specific `number`.

```javascript
const card = 3;
doesStackIncludeCard([2, 3, 4, 5], card);
// => true
```

## 3. Determine if each card is even

Elyse wants to know if every card is even -- in other words, if each number in the stack is an even `number`.

```javascript
isEachCardEven([2, 4, 6, 7]);
// => false
```

## 4. Check if the stack contains an odd-value card

Elyse wants to know if there is an odd number in the stack.

```javascript
doesStackIncludeOddCard([3, 2, 6, 4, 8]);
// => true
```

## 5. Get the first odd card from the stack

Elyse wants to know the value of the first card that is odd.

```javascript
getFirstOddCard([4, 2, 8, 7, 9]);
// => 7
```

## 6. Determine the position of the first card that is even

Elyse wants to know the position of the first card that is even.

```javascript
getFirstEvenCardPosition([5, 2, 3, 1]);
// => 1
```

## Hints

## 1. Find the position of a card

- Array indices starts at `0`.
- There is a [built-in][indexof_method_docs] method to get given value index.

## 2. Determine if a card is present

- There is a [built-in][includes_method_docs] method to check whether the value is present in the array

## 3. Determine if each card is even

- There is a [built-in][every_method_docs] method to check if each value passes a predicate

## 4. Check if the stack contains an odd-value card

- There is a [built-in][some_method_docs] method to check if at least one value passes a predicate

## 5. Get the first odd card from the stack

- There is a [built-in][find_method_docs] method to get the first item that passes a predicate

## 6. Determine the position of the first card that is even

- There is a [built-in][findindex_method_docs] method to get the first index in array that the value

[indexof_method_docs]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/indexOf
[includes_method_docs]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/includes
[every_method_docs]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/every
[some_method_docs]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/some
[find_method_docs]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/find
[findindex_method_docs]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/findIndex
