import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { valid } from './solution.ts'

describe('Luhn', () => {
  it('single digit strings can not be valid', () => {
    assert.ok(!(valid('1')))
  })

  it('a single zero is invalid', () => {
    assert.ok(!(valid('0')))
  })

  it('a simple valid SIN that remains valid if reversed', () => {
    assert.ok(valid('059'))
  })

  it('a simple valid SIN that becomes invalid if reversed', () => {
    assert.ok(valid('59'))
  })

  it('a valid Canadian SIN', () => {
    assert.ok(valid('055 444 285'))
  })

  it('invalid Canadian SIN', () => {
    assert.ok(!(valid('055 444 286')))
  })

  it('invalid credit card', () => {
    assert.ok(!(valid('8273 1232 7352 0569')))
  })

  it('invalid long number with an even remainder', () => {
    assert.ok(!(valid('1 2345 6789 1234 5678 9012')))
  })

  it('invalid long number with a remainder divisible by 5', () => {
    assert.ok(!(valid('1 2345 6789 1234 5678 9013')))
  })

  it('valid number with an even number of digits', () => {
    assert.ok(valid('095 245 88'))
  })

  it('valid number with an odd number of spaces', () => {
    assert.ok(valid('234 567 891 234'))
  })

  it('valid strings with a non-digit added at the end become invalid', () => {
    assert.ok(!(valid('059a')))
  })

  it('valid strings with punctuation included become invalid', () => {
    assert.ok(!(valid('055-444-285')))
  })

  it('valid strings with symbols included become invalid', () => {
    assert.ok(!(valid('055# 444$ 285')))
  })

  it('single zero with space is invalid', () => {
    assert.ok(!(valid(' 0')))
  })

  it('more than a single zero is valid', () => {
    assert.ok(valid('0000 0'))
  })

  it('input digit 9 is correctly converted to output digit 9', () => {
    assert.ok(valid('091'))
  })

  it('very long input is valid', () => {
    assert.ok(valid('9999999999 9999999999 9999999999 9999999999'))
  })

  it('valid luhn with an odd number of digits and non zero first digit', () => {
    assert.ok(valid('109'))
  })

  it("using ascii value for non-doubled non-digit isn't allowed", () => {
    assert.ok(!(valid('055b 444 285')))
  })

  it("using ascii value for doubled non-digit isn't allowed", () => {
    assert.ok(!(valid(':9')))
  })

  it("non-numeric, non-space char in the middle with a sum that's divisible by 10 isn't allowed", () => {
    assert.ok(!(valid('59%59')))
  })
})
