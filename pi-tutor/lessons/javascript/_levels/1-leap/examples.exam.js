import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { isLeap } from './solution.js';

describe('A leap year', () => {
  test('year not divisible by 4 in common year', () => {
    assert.strictEqual(isLeap(2015), false);
  });

  test('year divisible by 2, not divisible by 4 in common year', () => {
    assert.strictEqual(isLeap(1970), false);
  });

  test('year divisible by 4, not divisible by 100 in leap year', () => {
    assert.strictEqual(isLeap(1996), true);
  });

  test('year divisible by 4 and 5 is still a leap year', () => {
    assert.strictEqual(isLeap(1960), true);
  });

  test('year divisible by 100, not divisible by 400 in common year', () => {
    assert.strictEqual(isLeap(2100), false);
  });

  test('year divisible by 100 but not by 3 is still not a leap year', () => {
    assert.strictEqual(isLeap(1900), false);
  });

  test('year divisible by 400 in leap year', () => {
    assert.strictEqual(isLeap(2000), true);
  });

  test('year divisible by 400 but not by 125 is still a leap year', () => {
    assert.strictEqual(isLeap(2400), true);
  });

  test('year divisible by 200, not divisible by 400 in common year', () => {
    assert.strictEqual(isLeap(1800), false);
  });
});
