import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { isIsogram } from './solution.js';

describe('Isogram', () => {
  describe('Check if the given string is an isogram', () => {
    test('empty string', () => {
      assert.deepStrictEqual(isIsogram(''), true);
    });

    test('isogram with only lower case characters', () => {
      assert.deepStrictEqual(isIsogram('isogram'), true);
    });

    test('word with one duplicated character', () => {
      assert.deepStrictEqual(isIsogram('eleven'), false);
    });

    test('word with one duplicated character from the end of the alphabet', () => {
      assert.deepStrictEqual(isIsogram('zzyzx'), false);
    });

    test('longest reported english isogram', () => {
      assert.deepStrictEqual(isIsogram('subdermatoglyphic'), true);
    });

    test('word with duplicated character in mixed case', () => {
      assert.deepStrictEqual(isIsogram('Alphabet'), false);
    });

    test('word with duplicated character in mixed case, lowercase first', () => {
      assert.deepStrictEqual(isIsogram('alphAbet'), false);
    });

    test('hypothetical isogrammic word with hyphen', () => {
      assert.deepStrictEqual(isIsogram('thumbscrew-japingly'), true);
    });

    test('hypothetical word with duplicated character following hyphen', () => {
      assert.deepStrictEqual(isIsogram('thumbscrew-jappingly'), false);
    });

    test('isogram with duplicated hyphen', () => {
      assert.deepStrictEqual(isIsogram('six-year-old'), true);
    });

    test('made-up name that is an isogram', () => {
      assert.deepStrictEqual(isIsogram('Emily Jung Schwartzkopf'), true);
    });

    test('duplicated character in the middle', () => {
      assert.deepStrictEqual(isIsogram('accentor'), false);
    });

    test('same first and last characters', () => {
      assert.deepStrictEqual(isIsogram('angola'), false);
    });

    test('word with duplicated character and with two hyphens', () => {
      assert.deepStrictEqual(isIsogram('up-to-date'), false);
    });
  });
});
