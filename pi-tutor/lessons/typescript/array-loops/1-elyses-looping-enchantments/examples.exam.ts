import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { cardTypeCheck, determineOddEvenCards } from './solution.ts';

const TYPE_IS_ODD = false;
const TYPE_IS_EVEN = true;

describe('cardTypeCheck', () => {
  test('a single matching card', () => {
    assert.strictEqual(cardTypeCheck([1], 1), 1);
  });

  test('a single matching card among many', () => {
    assert.strictEqual(cardTypeCheck([7, 4, 7, 3, 1, 2], 1), 1);
  });

  test('a single unmatched card', () => {
    assert.strictEqual(cardTypeCheck([1], 2), 0);
  });

  test('multiple matching cards', () => {
    assert.strictEqual(cardTypeCheck([7, 7, 7], 7), 3);
  });

  test('multiple matching cards among many', () => {
    assert.strictEqual(cardTypeCheck([1, 2, 3, 7, 7, 7, 3, 2, 1], 7), 3);
  });

  test('no matching cards', () => {
    assert.strictEqual(cardTypeCheck([1, 2, 3, 4, 5, 4, 3, 2, 1], 7), 0);
  });
});

describe('determineOddEvenCards', () => {
  test('a single odd card', () => {
    assert.strictEqual(determineOddEvenCards([1], TYPE_IS_ODD), 1);
    assert.strictEqual(determineOddEvenCards([1], TYPE_IS_EVEN), 0);
  });

  test('a single even card', () => {
    assert.strictEqual(determineOddEvenCards([2], TYPE_IS_ODD), 0);
    assert.strictEqual(determineOddEvenCards([2], TYPE_IS_EVEN), 1);
  });

  test('multiple odd cards', () => {
    assert.strictEqual(determineOddEvenCards([1, 3, 5], TYPE_IS_ODD), 3);
    assert.strictEqual(determineOddEvenCards([1, 3, 5], TYPE_IS_EVEN), 0);
  });

  test('multiple even cards', () => {
    assert.strictEqual(determineOddEvenCards([2, 2, 4, 6, 6], TYPE_IS_ODD), 0);
    assert.strictEqual(determineOddEvenCards([2, 2, 4, 6, 6], TYPE_IS_EVEN), 5);
  });

  test('a mix of odd and even cards', () => {
    assert.strictEqual(determineOddEvenCards([1, 2, 1, 1, 2, 1, 9], TYPE_IS_ODD), 5);
    assert.strictEqual(determineOddEvenCards([1, 2, 1, 1, 2, 1, 9], TYPE_IS_EVEN), 2);
  });
});
