import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  checkSizeOfStack,
  getItem,
  insertItemAtBottom,
  insertItemAtTop,
  removeItem,
  removeItemAtBottom,
  removeItemFromTop,
  setItem,
} from './solution.ts';

describe('pick a card', () => {
  test('get the first card', () => {
    const stack = [1, 2, 3];
    const expected = 1;

    assert.strictEqual(getItem(stack, 0), expected);
  });

  test('get the middle card', () => {
    const stack = [4, 5, 6];
    const expected = 5;

    assert.strictEqual(getItem(stack, 1), expected);
  });

  test('get the last card', () => {
    const stack = [9, 8, 7];
    const expected = 7;

    assert.strictEqual(getItem(stack, 2), expected);
  });
});

describe('sleight of hand', () => {
  test('replace the first card with a 7', () => {
    const stack = [1, 2, 3];
    const position = 0;
    const replacement = 7;

    const expected = [7, 2, 3];
    assert.deepStrictEqual(setItem(stack, position, replacement), expected);
  });

  test('replace the middle card with a 5', () => {
    const stack = [2, 2, 2];
    const position = 1;
    const replacement = 5;

    const expected = [2, 5, 2];
    assert.deepStrictEqual(setItem(stack, position, replacement), expected);
  });

  test('replace the last card with a 7', () => {
    const stack = [7, 7, 6];
    const position = 2;
    const replacement = 7;

    const expected = [7, 7, 7];
    assert.deepStrictEqual(setItem(stack, position, replacement), expected);
  });
});

describe('make cards appear at the top', () => {
  test('adding a second card at the top', () => {
    const stack = [1];
    const newCard = 5;

    const expected = [1, 5];
    assert.deepStrictEqual(insertItemAtTop(stack, newCard), expected);
  });

  test('adding a third card at the top', () => {
    const stack = [1, 5];
    const newCard = 9;

    const expected = [1, 5, 9];
    assert.deepStrictEqual(insertItemAtTop(stack, newCard), expected);
  });

  test('adding a fourth card at the top', () => {
    const stack = [1, 5, 9];
    const newCard = 2;

    const expected = [1, 5, 9, 2];
    assert.deepStrictEqual(insertItemAtTop(stack, newCard), expected);
  });

  test('adding a different fourth card at the top', () => {
    const stack = [1, 5, 9];
    const newCard = 8;

    const expected = [1, 5, 9, 8];
    assert.deepStrictEqual(insertItemAtTop(stack, newCard), expected);
  });

  test('adding multiple cards to the stack at the top', () => {
    const stack = [1];

    insertItemAtTop(stack, 5);
    insertItemAtTop(stack, 9);

    const expected = [1, 5, 9];
    assert.deepStrictEqual(stack, expected);
  });
});

describe('make cards disappear', () => {
  test('remove the card at the bottom', () => {
    const stack = [1, 2, 3, 4];
    const position = 0;

    const expected = [2, 3, 4];

    if (stack[0] === undefined) {
      throw new Error(
        'The card has disappeared, but the stack has not changed in size. This magic trick has turned into actual magic. Perhaps a different method of removing the card will result in a stack that Elyse can work with...',
      );
    }

    assert.deepStrictEqual(removeItem(stack, position), expected);
  });

  test('remove the card at the top', () => {
    const stack = [1, 2, 3, 4];
    const position = 3;

    const expected = [1, 2, 3];
    assert.deepStrictEqual(removeItem(stack, position), expected);
  });

  test('remove the second card', () => {
    const stack = [1, 2, 3, 4];
    const position = 1;

    const expected = [1, 3, 4];
    assert.deepStrictEqual(removeItem(stack, position), expected);
  });

  test('remove the middle two cards', () => {
    const stack = [1, 2, 3, 4];

    removeItem(stack, 1);
    removeItem(stack, 1);

    const expected = [1, 4];
    assert.deepStrictEqual(stack, expected);
  });
});

describe('make the top card disappear', () => {
  test('remove the only card from the top', () => {
    const stack = [1];
    const expected = [];
    assert.deepStrictEqual(removeItemFromTop(stack), expected);
  });

  test('remove the card from the top', () => {
    const stack = [1, 2, 3];
    const expected = [1, 2];
    assert.deepStrictEqual(removeItemFromTop(stack), expected);
  });

  test('remove two cards from the top', () => {
    const stack = [1, 2, 3];

    removeItemFromTop(stack);
    removeItemFromTop(stack);

    const expected = [1];
    assert.deepStrictEqual(stack, expected);
  });
});

describe('make cards appear at the bottom', () => {
  test('adding a second card to the bottom', () => {
    const stack = [1];
    const newCard = 5;

    const expected = [5, 1];
    assert.deepStrictEqual(insertItemAtBottom(stack, newCard), expected);
  });

  test('adding a third card to the bottom', () => {
    const stack = [5, 1];
    const newCard = 9;

    const expected = [9, 5, 1];
    assert.deepStrictEqual(insertItemAtBottom(stack, newCard), expected);
  });

  test('adding a fourth card to the bottom', () => {
    const stack = [9, 5, 1];
    const newCard = 2;

    const expected = [2, 9, 5, 1];
    assert.deepStrictEqual(insertItemAtBottom(stack, newCard), expected);
  });

  test('adding a different fourth card to the bottom', () => {
    const stack = [9, 5, 1];
    const newCard = 8;

    const expected = [8, 9, 5, 1];
    assert.deepStrictEqual(insertItemAtBottom(stack, newCard), expected);
  });

  test('adding multiple cards to the stack to the bottom', () => {
    const stack = [1];

    insertItemAtBottom(stack, 5);
    insertItemAtBottom(stack, 9);

    const expected = [9, 5, 1];
    assert.deepStrictEqual(stack, expected);
  });
});

describe('make the bottom card disappear', () => {
  test('remove the only card from the bottom', () => {
    const stack = [1];
    const expected = [];
    assert.deepStrictEqual(removeItemAtBottom(stack), expected);
  });

  test('remove the card from the bottom', () => {
    const stack = [1, 2, 3];
    const expected = [2, 3];
    assert.deepStrictEqual(removeItemAtBottom(stack), expected);
  });

  test('remove two cards from the bottom', () => {
    const stack = [1, 2, 3];

    removeItemAtBottom(stack);
    removeItemAtBottom(stack);

    const expected = [3];
    assert.deepStrictEqual(stack, expected);
  });
});

describe('check your work', () => {
  test('an empty stack of cards has 0 cards', () => {
    const stack = [];

    assert.strictEqual(checkSizeOfStack(stack, 0), true);
    assert.strictEqual(checkSizeOfStack(stack, 1), false);
  });

  test('a stack with a single card has exactly 1 card', () => {
    const stack = [7];

    assert.strictEqual(checkSizeOfStack(stack, 0), false);
    assert.strictEqual(checkSizeOfStack(stack, 1), true);
    assert.strictEqual(checkSizeOfStack(stack, 2), false);
  });

  test('a stack with the even cards has exactly 4 cards', () => {
    const stack = [2, 4, 6, 8];

    assert.strictEqual(checkSizeOfStack(stack, 3), false);
    assert.strictEqual(checkSizeOfStack(stack, 4), true);
    assert.strictEqual(checkSizeOfStack(stack, 5), false);
  });

  test('a stack with the odd cards has exactly 5 cards', () => {
    const stack = [1, 3, 5, 7, 9];

    assert.strictEqual(checkSizeOfStack(stack, 3), false);
    assert.strictEqual(checkSizeOfStack(stack, 4), false);
    assert.strictEqual(checkSizeOfStack(stack, 5), true);
  });
});
