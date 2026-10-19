import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  addSecretIngredient,
  cookingStatus,
  preparationTime,
  quantities,
  scaleRecipe,
} from './solution.ts';

const DIFFERENCE_PRECISION_IN_DIGITS = 6;

describe('cookingStatus', () => {
  test('recognizes that there is time left on the timer', () => {
    const expected = 'Not done, please wait.';
    assert.strictEqual(cookingStatus(1), expected);
    assert.strictEqual(cookingStatus(42), expected);
    assert.strictEqual(cookingStatus(8.5), expected);
    assert.strictEqual(cookingStatus(0.1), expected);
  });

  test('recognizes when there is no time left on the timer', () => {
    assert.strictEqual(cookingStatus(0), 'Lasagna is done.');
  });

  test('returns a special status when no timer value was passed', () => {
    const expected = 'You forgot to set the timer.';
    assert.strictEqual(cookingStatus(), expected);
    assert.strictEqual(cookingStatus(undefined), expected);
  });
});

describe('preparationTime', () => {
  test('applies the custom average time per layer', () => {
    const manyLayers = [
      'sauce',
      'noodles',
      'béchamel',
      'meat',
      'mozzarella',
      'noodles',
      'ricotta',
      'eggplant',
      'béchamel',
      'noodles',
      'sauce',
      'mozzarella',
    ];
    assert.strictEqual(preparationTime(manyLayers, 1), 12);

    const fewLayers = ['sauce', 'noodles'];
    assert.strictEqual(preparationTime(fewLayers, 3.5), 7);
  });

  test('uses the default if no custom time was passed', () => {
    const manyLayers = [
      'sauce',
      'noodles',
      'béchamel',
      'meat',
      'mozzarella',
      'noodles',
      'ricotta',
      'eggplant',
      'béchamel',
      'noodles',
      'sauce',
      'mozzarella',
    ];
    assert.strictEqual(preparationTime(manyLayers), 24);

    const fewLayers = ['sauce', 'noodles'];
    assert.strictEqual(preparationTime(fewLayers), 4);
  });

  test('works with an empty layers array', () => {
    assert.strictEqual(preparationTime([]), 0);
  });
});

describe('quantities', () => {
  test('calculates the amounts of noodles and sauce correctly', () => {
    const fewLayers = ['noodles', 'sauce', 'noodles'];
    expectObjectsToBeEqual(quantities(fewLayers), { noodles: 100, sauce: 0.2 });

    const manyLayers = [
      'sauce',
      'noodles',
      'béchamel',
      'meat',
      'mozzarella',
      'noodles',
      'ricotta',
      'eggplant',
      'béchamel',
      'noodles',
      'sauce',
      'mozzarella',
    ];
    expectObjectsToBeEqual(quantities(manyLayers), {
      noodles: 150,
      sauce: 0.4,
    });
  });

  test('works if there are no noodles or no sauce found in the layers', () => {
    const noNoodles = ['sauce', 'béchamel', 'sauce', 'meat', 'sauce'];
    expectObjectsToBeEqual(quantities(noNoodles), { noodles: 0, sauce: 0.6 });

    const noSauce = ['eggplant', 'béchamel', 'noodles', 'béchamel'];
    expectObjectsToBeEqual(quantities(noSauce), { noodles: 50, sauce: 0 });
  });

  test('works with an empty layers array', () => {
    assert.deepStrictEqual(quantities([]), { noodles: 0, sauce: 0 });
  });
});

describe('addSecretIngredient', () => {
  test('adds the secret ingredient to the second array', () => {
    const friendsList = ['sauce', 'noodles', 'béchamel', 'marjoram'];
    const myList = ['sauce', 'noodles', 'meat', 'tomatoes'];
    addSecretIngredient(friendsList, myList);

    const expected = ['sauce', 'noodles', 'meat', 'tomatoes', 'marjoram'];
    assert.deepStrictEqual(myList, expected);
  });

  test('does not modify the first array', () => {
    const createFriendsList = () => [
      'noodles',
      'tomatoes',
      'sauce',
      'meat',
      'mozzarella',
      'eggplant',
      'ricotta',
      'parmesan',
    ];

    const friendsList = createFriendsList();
    const myList = ['ricotta', 'béchamel', 'sauce', 'noodles', 'meat'];
    addSecretIngredient(friendsList, myList);

    assert.deepStrictEqual(friendsList, createFriendsList());
  });

  test('does not return anything', () => {
    const friendsList = [
      'sauce',
      'noodles',
      'béchamel',
      'mozzarella',
      'mustard',
    ];
    const myList = ['sauce', 'noodles', 'tomatoes'];
    assert.strictEqual(addSecretIngredient(friendsList, myList), undefined);
  });
});

describe('scaleRecipe', () => {
  test('scales up correctly', () => {
    const recipe1 = {
      sauce: 0.5,
      noodles: 250,
      meat: 150,
      tomatoes: 3,
      onion: 0.5,
    };

    const expected1 = {
      sauce: 1.5,
      noodles: 750,
      meat: 450,
      tomatoes: 9,
      onion: 1.5,
    };

    expectObjectsToBeEqual(scaleRecipe(recipe1, 6), expected1);

    // prettier-ignore
    const recipe2 = {
      'sauce': 0.6,
      'noodles': 300,
      'carrots': 1,
      'mozzarella': 0.5,
      'ricotta': 50,
      'béchamel': 0.1,
      'tofu': 100,
    };

    // prettier-ignore
    const expected2 = {
      'sauce': 0.9,
      'noodles': 450,
      'carrots': 1.5,
      'mozzarella': 0.75,
      'ricotta': 75,
      'béchamel': 0.15,
      'tofu': 150,
    };

    expectObjectsToBeEqual(scaleRecipe(recipe2, 3), expected2);
  });

  test('scales down correctly', () => {
    const recipe = {
      sauce: 0.5,
      noodles: 250,
      meat: 150,
      tomatoes: 3,
      onion: 0.5,
    };

    const expected = {
      sauce: 0.25,
      noodles: 125,
      meat: 75,
      tomatoes: 1.5,
      onion: 0.25,
    };
    expectObjectsToBeEqual(scaleRecipe(recipe, 1), expected);
  });

  test('works for an empty recipe', () => {
    assert.deepStrictEqual(scaleRecipe({}), {});
  });

  test('does not modify the original recipe', () => {
    const recipe = {
      sauce: 1,
      noodles: 250,
      meat: 150,
      tomatoes: 3,
      onion: 2,
    };

    const copy = { ...recipe };

    scaleRecipe(recipe, 4);
    assert.deepStrictEqual(recipe, copy);
  });
});

/**
 * Jest does not support comparing objects that contain floating point number values.
 * https://github.com/facebook/jest/issues/3654
 * This helper functions applies "toBeCloseTo" to compare object values.
 */
function expectObjectsToBeEqual(actualObj, expectedObj) {
  for (const key in expectedObj) {
    assert.ok(Math.abs((actualObj[key]) - (expectedObj[key])) < 10 ** -DIFFERENCE_PRECISION_IN_DIGITS / 2);
  }
  assert.strictEqual(Object.keys(actualObj).length, Object.keys(expectedObj).length);
}
