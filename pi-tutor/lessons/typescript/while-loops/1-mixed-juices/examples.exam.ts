import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { limesToCut, remainingOrders, timeToMixJuice } from './solution.ts';

describe('timeToMixJuice', () => {
  test("returns the correct time for 'Pure Strawberry Joy'", () => {
    assert.strictEqual(timeToMixJuice('Pure Strawberry Joy'), 0.5);
  });

  test('returns the correct times for all other standard menu items', () => {
    assert.strictEqual(timeToMixJuice('Energizer'), 1.5);
    assert.strictEqual(timeToMixJuice('Green Garden'), 1.5);
    assert.strictEqual(timeToMixJuice('Tropical Island'), 3);
    assert.strictEqual(timeToMixJuice('All or Nothing'), 5);
  });

  test('returns the same time for all other juices', () => {
    const defaultTime = 2.5;
    assert.strictEqual(timeToMixJuice('Limetime'), defaultTime);
    assert.strictEqual(timeToMixJuice('Manic Organic'), defaultTime);
    assert.strictEqual(timeToMixJuice('Papaya & Peach'), defaultTime);
  });
});

describe('limesToCut', () => {
  test('calculates the number of limes needed to reach the target supply', () => {
    const limes = [
      'small',
      'large',
      'large',
      'medium',
      'small',
      'large',
      'large',
      'medium',
    ];
    assert.strictEqual(limesToCut(42, limes), 6);

    assert.strictEqual(limesToCut(4, ['medium', 'small']), 1);
  });

  test('uses up all limes if there are not enough to reach the target', () => {
    const limes = [
      'small',
      'large',
      'large',
      'medium',
      'small',
      'large',
      'large',
    ];

    assert.strictEqual(limesToCut(80, limes), 7);
  });

  test('if no new wedges are needed, no limes are cut', () => {
    assert.strictEqual(limesToCut(0, ['small', 'large', 'medium']), 0);
  });

  test('works if no limes are available', () => {
    assert.strictEqual(limesToCut(10, []), 0);
  });
});

describe('remainingOrders', () => {
  test('correctly determines the remaining orders', () => {
    const orders = [
      'Tropical Island',
      'Energizer',
      'Limetime',
      'All or Nothing',
      'Pure Strawberry Joy',
    ];
    const expected = ['All or Nothing', 'Pure Strawberry Joy'];

    assert.deepStrictEqual(remainingOrders(7, orders), expected);
  });

  test('correctly handles orders that were started because there was time left', () => {
    const orders = [
      'Pure Strawberry Joy',
      'Pure Strawberry Joy',
      'Vitality',
      'Tropical Island',
      'All or Nothing',
      'All or Nothing',
      'All or Nothing',
      'Green Garden',
      'Limetime',
    ];
    const expected = ['All or Nothing', 'Green Garden', 'Limetime'];

    assert.deepStrictEqual(remainingOrders(13, orders), expected);
  });

  test('counts all orders as fulfilled if there is enough time', () => {
    const orders = [
      'Energizer',
      'Green Garden',
      'Ruby Glow',
      'Pure Strawberry Joy',
      'Tropical Island',
      'Limetime',
    ];

    assert.deepStrictEqual(remainingOrders(12, orders), []);
  });

  test('works if there is only very little time left', () => {
    const orders = ['Bananas Gone Wild', 'Pure Strawberry Joy'];
    const expected = ['Pure Strawberry Joy'];

    assert.deepStrictEqual(remainingOrders(0.2, orders), expected);
  });
});
