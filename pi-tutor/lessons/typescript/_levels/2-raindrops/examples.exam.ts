import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { convert } from './solution.ts'

describe('Raindrops', () => {
  it('converts 1', () => assert.deepStrictEqual(convert(1), '1'))

  it('converts 3', () => assert.deepStrictEqual(convert(3), 'Pling'))

  it('converts 5', () => assert.deepStrictEqual(convert(5), 'Plang'))

  it('converts 7', () => assert.deepStrictEqual(convert(7), 'Plong'))

  it('converts 6', () => assert.deepStrictEqual(convert(6), 'Pling'))

  it('converts 9', () => assert.deepStrictEqual(convert(9), 'Pling'))

  it('converts 10', () => assert.deepStrictEqual(convert(10), 'Plang'))

  it('converts 14', () => assert.deepStrictEqual(convert(14), 'Plong'))

  it('converts 15', () => assert.deepStrictEqual(convert(15), 'PlingPlang'))

  it('converts 21', () => assert.deepStrictEqual(convert(21), 'PlingPlong'))

  it('converts 25', () => assert.deepStrictEqual(convert(25), 'Plang'))

  it('converts 35', () => assert.deepStrictEqual(convert(35), 'PlangPlong'))

  it('converts 49', () => assert.deepStrictEqual(convert(49), 'Plong'))

  it('converts 52', () => assert.deepStrictEqual(convert(52), '52'))

  it('converts 105', () => assert.deepStrictEqual(convert(105), 'PlingPlangPlong'))

  it('converts 12121', () => assert.deepStrictEqual(convert(12121), '12121'))
})
