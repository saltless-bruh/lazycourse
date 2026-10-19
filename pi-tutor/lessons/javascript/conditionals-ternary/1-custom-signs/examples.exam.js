import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  buildBirthdaySign,
  buildSign,
  costOf,
  graduationFor,
} from './solution.js';

describe('buildSign', () => {
  test('occasion is Birthday', () => {
    assert.strictEqual(buildSign('Birthday', 'Jack'), 'Happy Birthday Jack!');
  });

  test('occasion is Anniversary', () => {
    assert.strictEqual(buildSign('Anniversary', 'Jill'), 'Happy Anniversary Jill!');
  });
});

describe('buildBirthdaySign', () => {
  test('age is less than 50', () => {
    assert.strictEqual(buildBirthdaySign(49), 'Happy Birthday! What a young fellow you are.');
  });

  test('age is 50 or older', () => {
    assert.strictEqual(buildBirthdaySign(51), 'Happy Birthday! What a mature fellow you are.');
  });

  test('age is 50', () => {
    assert.strictEqual(buildBirthdaySign(50), 'Happy Birthday! What a mature fellow you are.');
  });
});

describe('graduationFor', () => {
  test('Robs graduation, 2021', () => {
    const expected = 'Congratulations Rob!\nClass of 2021';
    assert.strictEqual(graduationFor('Rob', 2021), expected);
  });

  test('Jills graduation, 1999', () => {
    const expected = 'Congratulations Jill!\nClass of 1999';
    assert.strictEqual(graduationFor('Jill', 1999), expected);
  });
});

describe('costOf', () => {
  test('sign is total of characters followed by the currency', () => {
    const sign = 'Happy Birthday!';
    const expected = 'Your sign costs 50.00 dollars.';
    assert.strictEqual(costOf(sign, 'dollars'), expected);
  });

  test('includes line breaks in the calculation', () => {
    const sign = 'Congratulations Rob\nClass of 2021';
    const expected = 'Your sign costs 86.00 dollars.';
    assert.strictEqual(costOf(sign, 'dollars'), expected);
  });

  test('handles different currency arguments', () => {
    const sign = 'Happy Easter, little sister!';
    const expected = 'Your sign costs 76.00 euros.';
    assert.strictEqual(costOf(sign, 'euros'), expected);
  });
});
