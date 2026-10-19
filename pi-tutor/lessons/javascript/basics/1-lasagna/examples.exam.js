import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  EXPECTED_MINUTES_IN_OVEN,
  preparationTimeInMinutes,
  remainingMinutesInOven,
  totalTimeInMinutes,
} from './solution.js';

describe('EXPECTED_MINUTES_IN_OVEN', () => {
  test('constant is defined correctly', () => {
    assert.strictEqual(EXPECTED_MINUTES_IN_OVEN, 40);
  });
});

describe('remainingMinutesInOven', () => {
  test('calculates the remaining time', () => {
    assert.strictEqual(remainingMinutesInOven(25), 15);
    assert.strictEqual(remainingMinutesInOven(5), 35);
    assert.strictEqual(remainingMinutesInOven(39), 1);
  });

  test('works correctly for the edge cases', () => {
    assert.strictEqual(remainingMinutesInOven(40), 0);
    assert.strictEqual(remainingMinutesInOven(0), 40);
  });
});

describe('preparationTimeInMinutes', () => {
  test('calculates the preparation time', () => {
    assert.strictEqual(preparationTimeInMinutes(1), 2);
    assert.strictEqual(preparationTimeInMinutes(2), 4);
    assert.strictEqual(preparationTimeInMinutes(8), 16);
  });
});

describe('totalTimeInMinutes', () => {
  test('calculates the total cooking time', () => {
    assert.strictEqual(totalTimeInMinutes(1, 5), 7);
    assert.strictEqual(totalTimeInMinutes(4, 15), 23);
    assert.strictEqual(totalTimeInMinutes(1, 30), 32);
  });
});
