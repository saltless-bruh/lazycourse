import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  canExecuteFastAttack,
  canFreePrisoner,
  canSignalPrisoner,
  canSpy,
} from './solution.ts';

describe('can execute fast attack', () => {
  test('when the knight is awake', () => {
    const knightIsAwake = true;
    const expected = false;

    assert.strictEqual(canExecuteFastAttack(knightIsAwake), expected);
  });

  test('when the knight is asleep', () => {
    const knightIsAwake = false;
    const expected = true;

    assert.strictEqual(canExecuteFastAttack(knightIsAwake), expected);
  });
});

describe('can spy', () => {
  test('when everyone is asleep', () => {
    const knightIsAwake = false;
    const archerIsAwake = false;
    const prisonerIsAwake = false;
    const expected = false;

    assert.strictEqual(canSpy(knightIsAwake, archerIsAwake, prisonerIsAwake), expected);
  });

  test('when only the prisoner is awake', () => {
    const knightIsAwake = false;
    const archerIsAwake = false;
    const prisonerIsAwake = true;
    const expected = true;

    assert.strictEqual(canSpy(knightIsAwake, archerIsAwake, prisonerIsAwake), expected);
  });

  test('when only the archer is awake', () => {
    const knightIsAwake = false;
    const archerIsAwake = true;
    const prisonerIsAwake = false;
    const expected = true;

    assert.strictEqual(canSpy(knightIsAwake, archerIsAwake, prisonerIsAwake), expected);
  });

  test('when only the knight is asleep', () => {
    const knightIsAwake = false;
    const archerIsAwake = true;
    const prisonerIsAwake = true;
    const expected = true;

    assert.strictEqual(canSpy(knightIsAwake, archerIsAwake, prisonerIsAwake), expected);
  });

  test('when only the knight is awake', () => {
    const knightIsAwake = true;
    const archerIsAwake = false;
    const prisonerIsAwake = false;
    const expected = true;

    assert.strictEqual(canSpy(knightIsAwake, archerIsAwake, prisonerIsAwake), expected);
  });

  test('when only the archer is asleep', () => {
    const knightIsAwake = true;
    const archerIsAwake = false;
    const prisonerIsAwake = true;
    const expected = true;

    assert.strictEqual(canSpy(knightIsAwake, archerIsAwake, prisonerIsAwake), expected);
  });

  test('when everyone is awake', () => {
    const knightIsAwake = true;
    const archerIsAwake = true;
    const prisonerIsAwake = true;
    const expected = true;

    assert.strictEqual(canSpy(knightIsAwake, archerIsAwake, prisonerIsAwake), expected);
  });
});

describe('can signal prisoner', () => {
  test('when everyone is asleep', () => {
    const archerIsAwake = false;
    const prisonerIsAwake = false;
    const expected = false;

    assert.strictEqual(canSignalPrisoner(archerIsAwake, prisonerIsAwake), expected);
  });

  test('when only the prisoner is awake', () => {
    const archerIsAwake = false;
    const prisonerIsAwake = true;
    const expected = true;

    assert.strictEqual(canSignalPrisoner(archerIsAwake, prisonerIsAwake), expected);
  });

  test('when only the archer is awake', () => {
    const archerIsAwake = true;
    const prisonerIsAwake = false;
    const expected = false;

    assert.strictEqual(canSignalPrisoner(archerIsAwake, prisonerIsAwake), expected);
  });

  test('when everyone is awake', () => {
    const archerIsAwake = true;
    const prisonerIsAwake = true;
    const expected = false;

    assert.strictEqual(canSignalPrisoner(archerIsAwake, prisonerIsAwake), expected);
  });
});

describe('can free prisoner', () => {
  test('when everyone is asleep and pet dog is not present', () => {
    const knightIsAwake = false;
    const archerIsAwake = false;
    const prisonerIsAwake = false;
    const petDogIsPresent = false;
    const expected = false;

    assert.strictEqual(canFreePrisoner(
        knightIsAwake,
        archerIsAwake,
        prisonerIsAwake,
        petDogIsPresent,
      ), expected);
  });

  test('when everyone is asleep and pet dog is present', () => {
    const knightIsAwake = false;
    const archerIsAwake = false;
    const prisonerIsAwake = false;
    const petDogIsPresent = true;
    const expected = true;

    assert.strictEqual(canFreePrisoner(
        knightIsAwake,
        archerIsAwake,
        prisonerIsAwake,
        petDogIsPresent,
      ), expected);
  });

  test('when only the prisoner is awake and pet dog is not present', () => {
    const knightIsAwake = false;
    const archerIsAwake = false;
    const prisonerIsAwake = true;
    const petDogIsPresent = false;
    const expected = true;

    assert.strictEqual(canFreePrisoner(
        knightIsAwake,
        archerIsAwake,
        prisonerIsAwake,
        petDogIsPresent,
      ), expected);
  });

  test('when only the prisoner is awake and pet dog is present', () => {
    const knightIsAwake = false;
    const archerIsAwake = false;
    const prisonerIsAwake = true;
    const petDogIsPresent = true;
    const expected = true;

    assert.strictEqual(canFreePrisoner(
        knightIsAwake,
        archerIsAwake,
        prisonerIsAwake,
        petDogIsPresent,
      ), expected);
  });

  test('when only the archer is awake and pet dog is not present', () => {
    const knightIsAwake = false;
    const archerIsAwake = true;
    const prisonerIsAwake = false;
    const petDogIsPresent = false;
    const expected = false;

    assert.strictEqual(canFreePrisoner(
        knightIsAwake,
        archerIsAwake,
        prisonerIsAwake,
        petDogIsPresent,
      ), expected);
  });

  test('when only the archer is awake and pet dog is present', () => {
    const knightIsAwake = false;
    const archerIsAwake = true;
    const prisonerIsAwake = false;
    const petDogIsPresent = true;
    const expected = false;

    assert.strictEqual(canFreePrisoner(
        knightIsAwake,
        archerIsAwake,
        prisonerIsAwake,
        petDogIsPresent,
      ), expected);
  });

  test('when only the knight is asleep and pet dog is not present', () => {
    const knightIsAwake = false;
    const archerIsAwake = true;
    const prisonerIsAwake = true;
    const petDogIsPresent = false;
    const expected = false;

    assert.strictEqual(canFreePrisoner(
        knightIsAwake,
        archerIsAwake,
        prisonerIsAwake,
        petDogIsPresent,
      ), expected);
  });

  test('when only the knight is asleep and pet dog is present', () => {
    const knightIsAwake = false;
    const archerIsAwake = true;
    const prisonerIsAwake = true;
    const petDogIsPresent = true;
    const expected = false;

    assert.strictEqual(canFreePrisoner(
        knightIsAwake,
        archerIsAwake,
        prisonerIsAwake,
        petDogIsPresent,
      ), expected);
  });

  test('when only the knight is awake and pet dog is not present', () => {
    const knightIsAwake = true;
    const archerIsAwake = false;
    const prisonerIsAwake = false;
    const petDogIsPresent = false;
    const expected = false;

    assert.strictEqual(canFreePrisoner(
        knightIsAwake,
        archerIsAwake,
        prisonerIsAwake,
        petDogIsPresent,
      ), expected);
  });

  test('when only the knight is awake and pet dog is present', () => {
    const knightIsAwake = true;
    const archerIsAwake = false;
    const prisonerIsAwake = false;
    const petDogIsPresent = true;
    const expected = true;

    assert.strictEqual(canFreePrisoner(
        knightIsAwake,
        archerIsAwake,
        prisonerIsAwake,
        petDogIsPresent,
      ), expected);
  });

  test('when only the archer is asleep and pet dog is not present', () => {
    const knightIsAwake = true;
    const archerIsAwake = false;
    const prisonerIsAwake = true;
    const petDogIsPresent = false;
    const expected = false;

    assert.strictEqual(canFreePrisoner(
        knightIsAwake,
        archerIsAwake,
        prisonerIsAwake,
        petDogIsPresent,
      ), expected);
  });

  test('when only the archer is asleep and pet dog is present', () => {
    const knightIsAwake = true;
    const archerIsAwake = false;
    const prisonerIsAwake = true;
    const petDogIsPresent = true;
    const expected = true;

    assert.strictEqual(canFreePrisoner(
        knightIsAwake,
        archerIsAwake,
        prisonerIsAwake,
        petDogIsPresent,
      ), expected);
  });

  test('when only the prisoner is asleep and pet dog is not present', () => {
    const knightIsAwake = true;
    const archerIsAwake = true;
    const prisonerIsAwake = false;
    const petDogIsPresent = false;
    const expected = false;

    assert.strictEqual(canFreePrisoner(
        knightIsAwake,
        archerIsAwake,
        prisonerIsAwake,
        petDogIsPresent,
      ), expected);
  });

  test('when only the prisoner is asleep and pet dog is present', () => {
    const knightIsAwake = true;
    const archerIsAwake = true;
    const prisonerIsAwake = false;
    const petDogIsPresent = true;
    const expected = false;

    assert.strictEqual(canFreePrisoner(
        knightIsAwake,
        archerIsAwake,
        prisonerIsAwake,
        petDogIsPresent,
      ), expected);
  });

  test('when everyone is awake and pet dog is not present', () => {
    const knightIsAwake = true;
    const archerIsAwake = true;
    const prisonerIsAwake = true;
    const petDogIsPresent = false;
    const expected = false;

    assert.strictEqual(canFreePrisoner(
        knightIsAwake,
        archerIsAwake,
        prisonerIsAwake,
        petDogIsPresent,
      ), expected);
  });

  test('when everyone is awake and pet dog is present', () => {
    const knightIsAwake = true;
    const archerIsAwake = true;
    const prisonerIsAwake = true;
    const petDogIsPresent = true;
    const expected = false;

    assert.strictEqual(canFreePrisoner(
        knightIsAwake,
        archerIsAwake,
        prisonerIsAwake,
        petDogIsPresent,
      ), expected);
  });
});
