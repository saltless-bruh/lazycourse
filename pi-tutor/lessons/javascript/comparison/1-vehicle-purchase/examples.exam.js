import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateResellPrice,
  chooseVehicle,
  needsLicense,
} from './solution.js';

describe('needsLicense', () => {
  test('requires a license for a car', () => {
    assert.strictEqual(needsLicense('car'), true);
  });

  test('requires a license for a truck', () => {
    assert.strictEqual(needsLicense('truck'), true);
  });

  test('does not require a license for a bike', () => {
    assert.strictEqual(needsLicense('bike'), false);
  });

  test('does not require a license for a stroller', () => {
    assert.strictEqual(needsLicense('stroller'), false);
  });

  test('does not require a license for an e-scooter', () => {
    assert.strictEqual(needsLicense('e-scooter'), false);
  });
});

describe('chooseVehicle', () => {
  const rest = ' is clearly the better choice.';

  test('correctly recommends the first option', () => {
    assert.strictEqual(chooseVehicle('Bugatti Veyron', 'Ford Pinto'), 'Bugatti Veyron' + rest);
    assert.strictEqual(chooseVehicle('Chery EQ', 'Kia Niro Elektro'), 'Chery EQ' + rest);
  });

  test('correctly recommends the second option', () => {
    assert.strictEqual(chooseVehicle('Ford Pinto', 'Bugatti Veyron'), 'Bugatti Veyron' + rest);
    assert.strictEqual(chooseVehicle('2020 Gazelle Medeo', '2018 Bergamont City'), '2018 Bergamont City' + rest);
  });
});

describe('calculateResellPrice', () => {
  test('price is reduced to 80% for age below 3', () => {
    assert.strictEqual(calculateResellPrice(40000, 2), 32000);
    assert.strictEqual(calculateResellPrice(40000, 2.5), 32000);
  });

  test('price is reduced to 50% for age above 10', () => {
    assert.strictEqual(calculateResellPrice(40000, 12), 20000);
  });

  test('price is reduced to 70% for between 3 and 10', () => {
    assert.strictEqual(calculateResellPrice(25000, 7), 17500);
  });

  test('works correctly for threshold age 3', () => {
    assert.strictEqual(calculateResellPrice(40000, 3), 28000);
  });

  test('works correctly for threshold age 10', () => {
    assert.strictEqual(calculateResellPrice(25000, 10), 17500);
  });
});
