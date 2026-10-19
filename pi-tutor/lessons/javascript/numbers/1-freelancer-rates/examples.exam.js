import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  dayRate,
  daysInBudget,
  priceWithMonthlyDiscount,
} from './solution.js';

const DIFFERENCE_PRECISION_IN_DIGITS = 6;

describe('day rate', () => {
  test('at 16/hour', () => {
    const actual = dayRate(16);
    assert.strictEqual(actual, 128);
  });

  test('at 25/hour', () => {
    const actual = dayRate(25);
    assert.strictEqual(actual, 200);
  });

  test('at 31.40/hour', () => {
    const actual = dayRate(31.4);
    assert.ok(Math.abs((actual) - (251.2)) < 10 ** -DIFFERENCE_PRECISION_IN_DIGITS / 2);
  });

  test('at 89.89/hour', () => {
    const actual = dayRate(89.89);
    assert.ok(Math.abs((actual) - (719.12)) < 10 ** -DIFFERENCE_PRECISION_IN_DIGITS / 2);
  });

  test('at 97.654321/hour', () => {
    const actual = dayRate(97.654321);
    assert.ok(Math.abs((actual) - (781.234568)) < 10 ** -DIFFERENCE_PRECISION_IN_DIGITS / 2);
  });
});

describe('days in budget', () => {
  test('with a budget of 1280 at 16/hour', () => {
    const actual = daysInBudget(1280, 16);
    const expected = 10;

    assert.ok(Math.abs((actual) - (expected)) < 10 ** -DIFFERENCE_PRECISION_IN_DIGITS / 2);
  });

  test('with a budget of 1280 at 25/hour', () => {
    const actual = daysInBudget(1280, 25);
    const expected = 6;

    assert.ok(Math.abs((actual) - (expected)) < 10 ** -DIFFERENCE_PRECISION_IN_DIGITS / 2);
  });

  test('with a budget of 835 at 12/hour', () => {
    const actual = daysInBudget(835, 12);
    const expected = 8;

    assert.ok(Math.abs((actual) - (expected)) < 10 ** -DIFFERENCE_PRECISION_IN_DIGITS / 2);
  });
});

describe('cost with monthly discount', () => {
  test('at 16/hour for 70 days', () => {
    const actual = priceWithMonthlyDiscount(16, 70, 0);
    const expected = 8960;
    assert.ok(Math.abs((actual) - (expected)) < 10 ** -DIFFERENCE_PRECISION_IN_DIGITS / 2);
  });

  test('at 16/hour for 130 days with 15% discount', () => {
    const actual = priceWithMonthlyDiscount(16, 130, 0.15);
    const expected = 14528;
    assert.ok(Math.abs((actual) - (expected)) < 10 ** -DIFFERENCE_PRECISION_IN_DIGITS / 2);
  });

  test('at 29.654321/hour for 220 days with 11.2%', () => {
    const actual = priceWithMonthlyDiscount(29.654321, 220, 0.112);
    const expected = 46347;
    assert.ok(Math.abs((actual) - (expected)) < 10 ** -DIFFERENCE_PRECISION_IN_DIGITS / 2);
  });

  test('at 29.654321/hour for 155 days with 25.47% discount', () => {
    const actual = priceWithMonthlyDiscount(29.654321, 155, 0.2547);
    const expected = 27467;
    assert.ok(Math.abs((actual) - (expected)) < 10 ** -DIFFERENCE_PRECISION_IN_DIGITS / 2);
  });
});
