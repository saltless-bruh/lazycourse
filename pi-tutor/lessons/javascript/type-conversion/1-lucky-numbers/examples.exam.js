import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { errorMessage, luckyNumber, twoSum } from './solution.js';

describe('twoSum', () => {
  test('sums the numbers correctly for short arrays', () => {
    const leftInput = [2, 4];
    const rightInput = [1, 5, 7];
    assert.strictEqual(twoSum(leftInput, rightInput), 181);
  });

  test('sums the numbers correctly for long arrays', () => {
    const leftInput = [1, 2, 4, 0, 3, 5, 2, 9];
    const rightInput = [3, 2, 4, 8, 1, 5, 4, 1, 8];
    assert.strictEqual(twoSum(leftInput, rightInput), 337218947);
  });
});

describe('luckyNumber', () => {
  test('identifies palindromic numbers', () => {
    assert.strictEqual(luckyNumber(15651), true);
    assert.strictEqual(luckyNumber(48911984), true);
  });

  test('identifies non-palindromic numbers', () => {
    assert.strictEqual(luckyNumber(156512), false);
    assert.strictEqual(luckyNumber(48921984), false);
  });

  test('works for small numbers', () => {
    assert.strictEqual(luckyNumber(0), true);
    assert.strictEqual(luckyNumber(33), true);
    assert.strictEqual(luckyNumber(12), false);
  });
});

describe('errorMessage', () => {
  test('identifies if there is no input value', () => {
    assert.strictEqual(errorMessage(''), 'Required field');
    assert.strictEqual(errorMessage(null), 'Required field');
    assert.strictEqual(errorMessage(undefined), 'Required field');
  });

  test('identifies invalid inputs', () => {
    assert.strictEqual(errorMessage('some text'), 'Must be a number besides 0');
    assert.strictEqual(errorMessage('86f1'), 'Must be a number besides 0');
    assert.strictEqual(errorMessage('4 2'), 'Must be a number besides 0');
    assert.strictEqual(errorMessage('0'), 'Must be a number besides 0');
  });

  test('returns an empty string for valid inputs', () => {
    assert.strictEqual(errorMessage('1.234'), '');
    assert.strictEqual(errorMessage('  784   '), '');
    assert.strictEqual(errorMessage('5e3'), '');
  });
});
