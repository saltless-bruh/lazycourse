import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isIsogram } from './solution.ts'

describe('Check if the given string is an isogram', () => {
  it('empty string', () => {
    const expected = true
    assert.deepStrictEqual(isIsogram(''), expected)
  })

  it('isogram with only lower case characters', () => {
    const expected = true
    assert.deepStrictEqual(isIsogram('isogram'), expected)
  })

  it('word with one duplicated character', () => {
    const expected = false
    assert.deepStrictEqual(isIsogram('eleven'), expected)
  })

  it('word with one duplicated character from the end of the alphabet', () => {
    const expected = false
    assert.deepStrictEqual(isIsogram('zzyzx'), expected)
  })

  it('longest reported english isogram', () => {
    const expected = true
    assert.deepStrictEqual(isIsogram('subdermatoglyphic'), expected)
  })

  it('word with duplicated character in mixed case', () => {
    const expected = false
    assert.deepStrictEqual(isIsogram('Alphabet'), expected)
  })

  it('word with duplicated character in mixed case, lowercase first', () => {
    const expected = false
    assert.deepStrictEqual(isIsogram('alphAbet'), expected)
  })

  it('hypothetical isogrammic word with hyphen', () => {
    const expected = true
    assert.deepStrictEqual(isIsogram('thumbscrew-japingly'), expected)
  })

  it('hypothetical word with duplicated character following hyphen', () => {
    const expected = false
    assert.deepStrictEqual(isIsogram('thumbscrew-jappingly'), expected)
  })

  it('isogram with duplicated hyphen', () => {
    const expected = true
    assert.deepStrictEqual(isIsogram('six-year-old'), expected)
  })

  it('made-up name that is an isogram', () => {
    const expected = true
    assert.deepStrictEqual(isIsogram('Emily Jung Schwartzkopf'), expected)
  })

  it('duplicated character in the middle', () => {
    const expected = false
    assert.deepStrictEqual(isIsogram('accentor'), expected)
  })

  it('same first and last characters', () => {
    const expected = false
    assert.deepStrictEqual(isIsogram('angola'), expected)
  })

  it('word with duplicated character and with two hyphens', () => {
    const expected = false
    assert.deepStrictEqual(isIsogram('up-to-date'), expected)
  })
})
