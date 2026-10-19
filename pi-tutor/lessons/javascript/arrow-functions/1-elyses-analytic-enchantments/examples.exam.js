import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  doesStackIncludeCard,
  doesStackIncludeOddCard,
  getCardPosition,
  getFirstEvenCardPosition,
  getFirstOddCard,
  isEachCardEven,
} from './solution.js';

describe('getCardPosition', () => {
  test('when it is the first card', () => {
    assert.strictEqual(getCardPosition([1, 2, 3], 1), 0);
  });
  test('when the card is not found', () => {
    assert.strictEqual(getCardPosition([1, 2, 3], 4), -1);
  });
});

describe('doesStackIncludeCard', () => {
  test('when there is a card found', () => {
    assert.strictEqual(doesStackIncludeCard([1, 2, 3], 1), true);
  });
  test('when a card is not found', () => {
    assert.strictEqual(doesStackIncludeCard([1, 2, 3], 4), false);
  });
});

describe('isEachCardEven', () => {
  test('when all cards are even', () => {
    assert.strictEqual(isEachCardEven([2, 4, 6]), true);
  });
  test('when any card is odd', () => {
    assert.strictEqual(isEachCardEven([2, 5, 6]), false);
  });
});

describe('doesStackIncludeOddCard', () => {
  test('should be true if odd number card is found', () => {
    assert.strictEqual(doesStackIncludeOddCard([2, 5]), true);
  });
  test('should be false if no odd number card is found', () => {
    assert.strictEqual(doesStackIncludeOddCard([2, 4, 6]), false);
  });
});

describe('getFirstOddCard', () => {
  test('should return the first odd card found', () => {
    assert.strictEqual(getFirstOddCard([2, 4, 1, 3]), 1);
  });
  test('should return undefined if odd card is not found', () => {
    assert.strictEqual(getFirstOddCard([4, 2, 6]), undefined);
  });
});

describe('getFirstEvenCardPosition', () => {
  test('should return position of first even card', () => {
    assert.strictEqual(getFirstEvenCardPosition([2, 4, 1, 3]), 0);
  });
  test('should return -1 when the card is not found', () => {
    assert.strictEqual(getFirstEvenCardPosition([1, 3, 5]), -1);
  });
});
