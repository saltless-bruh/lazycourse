import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { valid } from './solution.js';

describe('Luhn', () => {
  test('single digit strings can not be valid', () => {
    assert.deepStrictEqual(valid('1'), false);
  });

  test('a single zero is invalid', () => {
    assert.deepStrictEqual(valid('0'), false);
  });

  test('a simple valid SIN that remains valid if reversed', () => {
    assert.deepStrictEqual(valid('059'), true);
  });

  test('a simple valid SIN that becomes invalid if reversed', () => {
    assert.deepStrictEqual(valid('59'), true);
  });

  test('a valid Canadian SIN', () => {
    assert.deepStrictEqual(valid('055 444 285'), true);
  });

  test('invalid Canadian SIN', () => {
    assert.deepStrictEqual(valid('055 444 286'), false);
  });

  test('invalid credit card', () => {
    assert.deepStrictEqual(valid('8273 1232 7352 0569'), false);
  });

  test('invalid long number with an even remainder', () => {
    assert.deepStrictEqual(valid('1 2345 6789 1234 5678 9012'), false);
  });

  test('invalid long number with a remainder divisible by 5', () => {
    assert.deepStrictEqual(valid('1 2345 6789 1234 5678 9013'), false);
  });

  test('valid number with an even number of digits', () => {
    assert.deepStrictEqual(valid('095 245 88'), true);
  });

  test('valid number with an odd number of spaces', () => {
    assert.deepStrictEqual(valid('234 567 891 234'), true);
  });

  test('valid strings with a non-digit added at the end invalid', () => {
    assert.deepStrictEqual(valid('059a'), false);
  });

  test('valid strings with punctuation included become invalid', () => {
    assert.deepStrictEqual(valid('055-444-285'), false);
  });

  test('valid strings with symbols included become invalid', () => {
    assert.deepStrictEqual(valid('055# 444$ 285'), false);
  });

  test('single zero with space is invalid', () => {
    assert.deepStrictEqual(valid(' 0'), false);
  });

  test('more than a single zero is valid', () => {
    assert.deepStrictEqual(valid('0000 0'), true);
  });

  test('input digit 9 is correctly converted to output digit 9', () => {
    assert.deepStrictEqual(valid('091'), true);
  });

  test('very long input is valid', () => {
    assert.deepStrictEqual(valid('9999999999 9999999999 9999999999 9999999999'), true);
  });

  test('valid luhn with an odd number of digits and non zero first digit', () => {
    assert.deepStrictEqual(valid('109'), true);
  });

  test("using ascii value for non-doubled non-digit isn't allowed", () => {
    assert.deepStrictEqual(valid('055b 444 285'), false);
  });

  test("using ascii value for doubled non-digit isn't allowed", () => {
    assert.deepStrictEqual(valid(':9'), false);
  });

  test("non-numeric, non-space char in the middle with a sum that's divisible by 10 isn't allowed", () => {
    assert.deepStrictEqual(valid('59%59'), false);
  });
});
