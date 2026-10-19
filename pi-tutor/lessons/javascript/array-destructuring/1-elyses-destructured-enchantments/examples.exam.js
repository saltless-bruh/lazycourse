import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  getFirstCard,
  getSecondCard,
  swapTwoCards,
  shiftThreeCardsAround,
  pickNamedPile,
  swapNamedPile,
} from './solution.js';

const customInspectSymbol = Symbol.for('nodejs.util.inspect.custom');
const customLogSymbol = Symbol.for('exercism.javascript.util.log');

// Follow the instructions in case you are stuck on "list.method is not a function"
class LimitedDeck {
  constructor(values) {
    this.values = values;
  }

  // Enables rest syntax and spread operator, as wel as for of, etc.
  [Symbol.iterator]() {
    return this.values[Symbol.iterator]();
  }

  // Log value in non-upgraded environments
  toString() {
    return this.values.toString();
  }

  // Overrides logging in node (ie. students working locally)
  [customInspectSymbol](depth, inspectOptions, inspect) {
    const inner = this.values[customInspectSymbol]
      ? this.values[customInspectSymbol](depth, inspectOptions, inspect)
      : this.values.toString();

    return `List of (${inner})`;
  }

  // Overrides log overrides in web environment (ie. students working in editor)
  [customLogSymbol](depth, inspectOptions, inspect) {
    const inner = this.values[customLogSymbol]
      ? this.values[customLogSymbol](depth, inspectOptions, inspect)
      : this.values.toString();

    return `List of (${inner})`;
  }
}

function deck(...values) {
  return new LimitedDeck(values);
}

describe('getFirstCard', () => {
  test('from a deck with a single card', () => {
    assert.strictEqual(getFirstCard(deck(3)), 3);
  });

  test('from a deck with many cards', () => {
    assert.strictEqual(getFirstCard(deck(8, 3, 9, 5)), 8);
  });

  test('from an empty deck', () => {
    assert.strictEqual(getFirstCard(deck()), undefined);
  });
});

describe('getSecondCard', () => {
  test('from a deck with two cards', () => {
    assert.strictEqual(getSecondCard(deck(10, 4)), 4);
  });

  test('from a deck with many cards', () => {
    assert.strictEqual(getSecondCard(deck(2, 5, 7, 6)), 5);
  });

  test('from an empty deck', () => {
    assert.strictEqual(getSecondCard(deck()), undefined);
  });

  test('from a deck with one card', () => {
    assert.strictEqual(getSecondCard(deck(8)), undefined);
  });
});

describe('swapTwoCards', () => {
  test('swapping two numbered cards', () => {
    assert.deepStrictEqual(swapTwoCards(deck(3, 6)), [6, 3]);
  });

  test('swapping a high card with a low card', () => {
    assert.deepStrictEqual(swapTwoCards(deck(10, 2)), [2, 10]);
  });

  test('swapping a face card with a low card', () => {
    assert.deepStrictEqual(swapTwoCards(deck('king', 3)), [3, 'king']);
  });
});

describe('shiftThreeCardsAround', () => {
  test('consecutive numbers', () => {
    assert.deepStrictEqual(shiftThreeCardsAround(deck(6, 4, 5)), [4, 5, 6]);
  });

  test('drop the face card to the bottom', () => {
    assert.deepStrictEqual(shiftThreeCardsAround(deck('king', 5, 2)), [
      5,
      2,
      'king',
    ]);
  });
});

describe('pickNamedPile', () => {
  test('keeps the chosen pile', () => {
    const chosen = deck(3, 'jack', 'queen', 'king', 10, 7);
    const disregarded = deck(4, 5, 6, 8, 9);
    const piles = { chosen, disregarded };

    assert.deepStrictEqual(pickNamedPile(piles), chosen);
  });

  test('returns the actual pile without recreating it', () => {
    const chosen = deck(3, 'jack', 'queen', 'king', 10, 7);
    const disregarded = deck(4, 5, 6, 8, 9);
    const piles = { chosen, disregarded };

    const result = pickNamedPile(piles);

    chosen.values.push('joker');

    assert.deepStrictEqual(result, chosen);
  });
});

describe('swapNamedPile', () => {
  test('renames the piles', () => {
    const face_pile = deck(3, 'jack', 'queen', 'king', 10, 7);
    const numbers_pile = deck(4, 5, 6, 8, 9);
    const piles = { chosen: numbers_pile, disregarded: face_pile };

    assert.deepStrictEqual(swapNamedPile(piles), {
      chosen: face_pile,
      disregarded: numbers_pile,
    });
  });

  test('returns the actual piles without recreating them', () => {
    const face_pile = deck(3, 'jack', 'queen', 'king', 10, 7);
    const numbers_pile = deck(4, 5, 6, 8, 9);
    const piles = { chosen: numbers_pile, disregarded: face_pile };

    const result = swapNamedPile(piles);

    face_pile.values.push('joker');
    numbers_pile.values.push(2);

    assert.deepStrictEqual(result, {
      chosen: face_pile,
      disregarded: numbers_pile,
    });
  });
});
