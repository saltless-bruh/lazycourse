import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { orderPrice, pizzaPrice } from './solution.ts';

class PizzaOrder {
  /**
   *
   * @param {Pizza} pizza
   * @param  {Extra[]} extras
   */
  constructor(pizza, ...extras) {
    this.pizza = pizza;
    this.extras = Object.freeze(extras);

    Object.freeze(this);
  }
}

describe('Price for pizza margherita', () => {
  test("pizzaPrice('Margherita')", () => {
    assert.strictEqual(pizzaPrice('Margherita'), 7);
  });
});

describe('Price for pizza formaggio', () => {
  test("pizzaPrice('Formaggio')", () => {
    assert.strictEqual(pizzaPrice('Formaggio'), 10);
  });
});

describe('Price for pizza caprese', () => {
  test("pizzaPrice('Caprese')", () => {
    assert.strictEqual(pizzaPrice('Caprese'), 9);
  });
});

describe('Price for pizza margherita with extra sauce', () => {
  test("pizzaPrice('Margherita', 'ExtraSauce')", () => {
    assert.strictEqual(pizzaPrice('Margherita', 'ExtraSauce'), 8);
  });
});

describe('Price for pizza caprese with extra toppings', () => {
  test("pizzaPrice('Caprese', 'ExtraToppings')", () => {
    assert.strictEqual(pizzaPrice('Caprese', 'ExtraToppings'), 11);
  });
});

describe('Price for pizza formaggio with extra sauce and toppings', () => {
  test("pizzaPrice('Formaggio', 'ExtraSauce', 'ExtraToppings')", () => {
    assert.strictEqual(pizzaPrice('Formaggio', 'ExtraSauce', 'ExtraToppings'), 13);
  });
});

describe('Price for pizza caprese with extra sauce and toppings', () => {
  test("pizzaPrice('Caprese', 'ExtraSauce', 'ExtraToppings')", () => {
    assert.strictEqual(pizzaPrice('Caprese', 'ExtraSauce', 'ExtraToppings'), 12);
  });
});

describe('Price for pizza caprese with a lot of extra toppings', () => {
  test("pizzaPrice('Caprese', 'ExtraToppings', 'ExtraToppings', 'ExtraToppings', 'ExtraToppings')", () => {
    assert.strictEqual(pizzaPrice(
        'Caprese',
        'ExtraToppings',
        'ExtraToppings',
        'ExtraToppings',
        'ExtraToppings',
      ), 17);
  });
});

describe('Order price for no pizzas', () => {
  test('orderPrice([])', () => {
    assert.strictEqual(orderPrice([]), 0);
  });
});

describe('Order price for a single pizza caprese', () => {
  test("orderPrice([PizzaOrder('Caprese')])", () => {
    const order = new PizzaOrder('Caprese');
    assert.strictEqual(orderPrice([order]), 9);
  });
});

describe('Order price for a single pizza formaggio with extra sauce', () => {
  test("orderPrice([PizzaOrder('Formaggio', 'ExtraSauce')])", () => {
    const order = new PizzaOrder('Formaggio', 'ExtraSauce');
    assert.strictEqual(orderPrice([order]), 11);
  });
});

describe('Order price for one pizza margherita and one pizza caprese with extra toppings', () => {
  test("orderPrice([PizzaOrder('Margherita'), PizzaOrder('Caprese', 'ExtraToppings')])", () => {
    const margherita = new PizzaOrder('Margherita');
    const caprese = new PizzaOrder('Caprese', 'ExtraToppings');

    assert.strictEqual(orderPrice([margherita, caprese]), 18);

    // Also test that the order doesn't matter
    assert.strictEqual(orderPrice([caprese, margherita]), 18);
  });
});

describe('Order price for one pizza margherita with a LOT of sauce and one pizza caprese with a LOT of toppings', () => {
  test("orderPrice([PizzaOrder('Margherita', 'ExtraSauce', 'ExtraSauce', 'ExtraSauce'), PizzaOrder('Caprese', 'ExtraToppings', 'ExtraToppings', 'ExtraToppings', 'ExtraToppings')])", () => {
    const saucyMargherita = new PizzaOrder(
      'Margherita',
      'ExtraSauce',
      'ExtraSauce',
      'ExtraSauce',
    );
    const toppedCaprese = new PizzaOrder(
      'Caprese',
      'ExtraToppings',
      'ExtraToppings',
      'ExtraToppings',
      'ExtraToppings',
    );

    assert.strictEqual(orderPrice([saucyMargherita, toppedCaprese]), 27);

    // Also test that the order doesn't matter
    assert.strictEqual(orderPrice([toppedCaprese, saucyMargherita]), 27);
  });
});

describe('Order price for very large order', () => {
  test('orderPrice([/* lots of */])', () => {
    const margherita = new PizzaOrder('Margherita');
    const margherita2 = new PizzaOrder('Margherita', 'ExtraSauce');
    const caprese = new PizzaOrder('Caprese');
    const caprese2 = new PizzaOrder('Caprese', 'ExtraToppings');
    const formaggio = new PizzaOrder('Formaggio');
    const formaggio2 = new PizzaOrder('Formaggio', 'ExtraSauce');
    const formaggio3 = new PizzaOrder(
      'Formaggio',
      'ExtraSauce',
      'ExtraToppings',
    );
    const formaggio4 = new PizzaOrder(
      'Formaggio',
      'ExtraToppings',
      'ExtraSauce',
      'ExtraToppings',
      'ExtraSauce',
    );

    const actual = orderPrice([
      margherita,
      margherita2,
      caprese,
      caprese2,
      formaggio,
      formaggio2,
      formaggio3,
      formaggio4,
    ]);
    assert.strictEqual(actual, 85);
  });
});

describe('Order price for a gigantic order', () => {
  test('orderPrice([/* lots of */])', () => {
    const allTheMargheritas = Array(100 * 1000).fill(
      new PizzaOrder('Margherita'),
    );
    const actual = orderPrice(allTheMargheritas);
    assert.strictEqual(actual, 700 * 1000);
  });
});
