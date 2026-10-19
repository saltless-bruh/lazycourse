import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  isBoolean,
  isNumber,
  isObject,
  isNumericString,
  isElectronic,
  isNonEmptyArray,
  isEmptyArray,
  assertHasId,
  hasType,
  hasIdProperty,
  hasDefinedType,
} from './solution.js';
import { ElectronicDevice } from './lib.js';

describe('isBoolean', () => {
  test('returns true for true', () => {
    assert.strictEqual(isBoolean(true), true);
  });

  test('returns true for false', () => {
    assert.strictEqual(isBoolean(false), true);
  });

  test('returns false for numbers', () => {
    assert.strictEqual(isBoolean(42), false);
    assert.strictEqual(isBoolean(42n), false);
    assert.strictEqual(isBoolean(0), false);
  });

  test('returns false for strings', () => {
    assert.strictEqual(isBoolean('Hello, World!'), false);
    assert.strictEqual(isBoolean('42'), false);
    assert.strictEqual(isBoolean('true'), false);
    assert.strictEqual(isBoolean(''), false);
  });

  test('returns false for null', () => {
    assert.strictEqual(isBoolean(null), false);
  });

  test('returns false for undefined', () => {
    assert.strictEqual(isBoolean(undefined), false);
  });

  test('returns false for symbols', () => {
    assert.strictEqual(isBoolean(Symbol('1')), false);
    assert.strictEqual(isBoolean(Symbol('true')), false);
  });

  test('returns false for objects', () => {
    assert.strictEqual(isBoolean({}), false);
    assert.strictEqual(isBoolean({ true: false }), false);
  });

  test('returns false for arrays', () => {
    assert.strictEqual(isBoolean([]), false);
    assert.strictEqual(isBoolean([true, false]), false);
  });
});

describe('isNumber', () => {
  test('returns true for numbers', () => {
    assert.strictEqual(isNumber(42), true);
    assert.strictEqual(isNumber(0), true);
    assert.strictEqual(isNumber(43_859_435.12), true);
    assert.strictEqual(isNumber(Number.MAX_SAFE_INTEGER), true);
    assert.strictEqual(isNumber(Number.MAX_VALUE), true);
    assert.strictEqual(isNumber(Number.MIN_SAFE_INTEGER), true);
    assert.strictEqual(isNumber(Number.MIN_VALUE), true);
  });

  test('returns true for bigints', () => {
    assert.strictEqual(isNumber(42n), true);
    assert.strictEqual(isNumber(0n), true);
    assert.strictEqual(isNumber(92n), true);
    assert.strictEqual(isNumber(1_848_958_451n), true);
    assert.strictEqual(isNumber(9_007_199_254_740_991n), true);
    assert.strictEqual(isNumber(9_999_999_999_999_999n), true);
  });

  test('returns false for non-finite numbers such as NaN', () => {
    assert.strictEqual(isNumber(NaN), false);
    assert.strictEqual(isNumber(Infinity), false);
  });

  test('returns false for strings', () => {
    assert.strictEqual(isNumber('Hello, World!'), false);
    assert.strictEqual(isNumber('42'), false);
    assert.strictEqual(isNumber('true'), false);
    assert.strictEqual(isNumber(''), false);
  });

  test('returns false for null', () => {
    assert.strictEqual(isNumber(null), false);
  });

  test('returns false for undefined', () => {
    assert.strictEqual(isNumber(undefined), false);
  });

  test('returns false for symbols', () => {
    assert.strictEqual(isNumber(Symbol('1')), false);
    assert.strictEqual(isNumber(Symbol('true')), false);
  });

  test('returns false for objects', () => {
    assert.strictEqual(isNumber({}), false);
    assert.strictEqual(isNumber({ true: false }), false);
  });

  test('returns false for arrays', () => {
    assert.strictEqual(isNumber([]), false);
    assert.strictEqual(isNumber([1]), false);
  });

  test('returns false for booleans', () => {
    assert.strictEqual(isNumber(true), false);
    assert.strictEqual(isNumber(false), false);
  });
});

class ClassForTesting {
  constructor(number, word) {
    this.number = number;
    this.word = word;
  }

  id() {}
}

describe('isObject', () => {
  test('returns true on object literals', () => {
    assert.strictEqual(isObject({}), true);
    assert.strictEqual(isObject({ greeting: 'hello' }), true);
  });

  test('returns true on class instances', () => {
    assert.strictEqual(isObject(new ClassForTesting(5, 'Hello')), true);
    assert.strictEqual(isObject(new ClassForTesting(58, 'null')), true);
    assert.strictEqual(isObject(new ClassForTesting(1488, 'World!')), true);
  });

  test('returns true for arrays which are objects', () => {
    assert.strictEqual(isObject([]), true);
    assert.strictEqual(isObject([{}]), true);
  });

  test('returns false on functions', () => {
    assert.strictEqual(isObject(isObject), false);
    assert.strictEqual(isObject(() => {}), false);
    assert.strictEqual(isObject(() => ({})), false);
  });

  test('returns false for strings', () => {
    assert.strictEqual(isObject('Hello, World!'), false);
    assert.strictEqual(isObject('{}'), false);
    assert.strictEqual(isObject('42'), false);
    assert.strictEqual(isObject('true'), false);
    assert.strictEqual(isObject(''), false);
  });

  test('returns false for null', () => {
    assert.strictEqual(isObject(null), false);
  });

  test('returns false for undefined', () => {
    assert.strictEqual(isObject(undefined), false);
  });

  test('returns false for symbols', () => {
    assert.strictEqual(isObject(Symbol('1')), false);
    assert.strictEqual(isObject(Symbol('true')), false);
  });
  test('returns false for booleans', () => {
    assert.strictEqual(isObject(true), false);
    assert.strictEqual(isObject(false), false);
  });
});

describe('isNumericString', () => {
  test('returns true on single-digit strings', () => {
    assert.strictEqual(isNumericString('1'), true);
    assert.strictEqual(isNumericString('0'), true);
    assert.strictEqual(isNumericString('9'), true);
  });

  test('returns true on negative single-digit strings', () => {
    assert.strictEqual(isNumericString('-1'), true);
    assert.strictEqual(isNumericString('-0'), true);
    assert.strictEqual(isNumericString('-9'), true);
  });

  test('returns true on multi-digit strings', () => {
    assert.strictEqual(isNumericString('12'), true);
    assert.strictEqual(isNumericString('00'), true);
    assert.strictEqual(isNumericString('42'), true);
    assert.strictEqual(isNumericString('-582'), true);
  });

  test('returns false on non-numeric strings', () => {
    assert.strictEqual(isNumericString(''), false);
    assert.strictEqual(isNumericString('-'), false);
    assert.strictEqual(isNumericString('--'), false);
    assert.strictEqual(isNumericString('--32'), false);
    assert.strictEqual(isNumericString('Hello, World!'), false);
    assert.strictEqual(isNumericString('<!DOCTYPE HTML>'), false);
    assert.strictEqual(isNumericString('NaN'), false);
  });

  test('returns false for bigint strings', () => {
    assert.strictEqual(isNumericString('12n'), false);
    assert.strictEqual(isNumericString('-582n'), false);
  });

  test('returns false for null', () => {
    assert.strictEqual(isNumericString(null), false);
  });

  test('returns false for undefined', () => {
    assert.strictEqual(isNumericString(undefined), false);
  });

  test('returns false for symbols', () => {
    assert.strictEqual(isNumericString(Symbol('1')), false);
    assert.strictEqual(isNumericString(Symbol('true')), false);
  });

  test('returns false for arrays', () => {
    assert.strictEqual(isNumericString([]), false);
    assert.strictEqual(isNumericString(['42']), false);
  });

  test('returns false for booleans', () => {
    assert.strictEqual(isNumericString(true), false);
    assert.strictEqual(isNumericString(false), false);
  });
});

class Oven extends ElectronicDevice {}
class Computer extends ElectronicDevice {}
class PersonalComputer extends Computer {}
class HomeMadePersonalComputer extends PersonalComputer {}

describe('isElectronic', () => {
  test('returns true on ElectronicDevices', () => {
    assert.strictEqual(isElectronic(new ElectronicDevice()), true);
  });

  test('returns true on sub-classes of ElectronicDevice', () => {
    assert.strictEqual(isElectronic(new Oven()), true);
    assert.strictEqual(isElectronic(new PersonalComputer()), true);
    assert.strictEqual(isElectronic(new HomeMadePersonalComputer()), true);
  });

  test('returns false on electronic devices not created using the constructor', () => {
    assert.strictEqual(isElectronic(Object.create(ElectronicDevice.prototype)), false);
    assert.strictEqual(isElectronic({ __proto__: ElectronicDevice.prototype }), false);

    const fakeDevice = {};
    Object.setPrototypeOf(fakeDevice, ElectronicDevice.prototype);
    assert.strictEqual(isElectronic(fakeDevice), false);
  });

  test('returns false on non-electronic device objects', () => {
    assert.strictEqual(isElectronic({ language: 'javascript', typing: 'dynamic' }), false);
    assert.strictEqual(isElectronic(new ClassForTesting(42, 'ElectronicDevice')), false);
    assert.strictEqual(isElectronic([1, 2, 3, 4]), false);
  });

  test('returns false for strings', () => {
    assert.strictEqual(isElectronic('12n'), false);
    assert.strictEqual(isElectronic('ElectronicDevice'), false);
  });

  test('returns false for null', () => {
    assert.strictEqual(isElectronic(null), false);
  });

  test('returns false for undefined', () => {
    assert.strictEqual(isElectronic(undefined), false);
  });

  test('returns false for symbols', () => {
    assert.strictEqual(isElectronic(Symbol('1')), false);
    assert.strictEqual(isElectronic(Symbol('true')), false);
  });

  test('returns false for arrays', () => {
    assert.strictEqual(isElectronic([]), false);
    assert.strictEqual(isElectronic(['42']), false);
  });

  test('returns false for booleans', () => {
    assert.strictEqual(isElectronic(true), false);
    assert.strictEqual(isElectronic(false), false);
  });
});

describe('isNonEmptyArray', () => {
  test('returns true for non-empty arrays', () => {
    assert.strictEqual(isNonEmptyArray([1, 2, 3]), true);
    assert.strictEqual(isNonEmptyArray(['a', 'b']), true);

    // The prototype of Array is also an array, but in Node it's considered empty
    // assert.strictEqual(isNonEmptyArray(Array.prototype), true);
  });

  test('returns false for empty arrays', () => {
    assert.strictEqual(isNonEmptyArray([]), false);
  });

  test('returns false for fake non-empty arrays', () => {
    assert.strictEqual(isNonEmptyArray({ __proto__: Array.prototype, length: 1 }), false);

    const fakeArray = { length: 1 };
    Object.setPrototypeOf(fakeArray, Array.prototype);
    assert.strictEqual(isNonEmptyArray(fakeArray), false);
  });

  test('returns false for strings', () => {
    assert.strictEqual(isNonEmptyArray('12n'), false);
    assert.strictEqual(isNonEmptyArray('[1]'), false);
  });

  test('returns false for null', () => {
    assert.strictEqual(isNonEmptyArray(null), false);
  });

  test('returns false for undefined', () => {
    assert.strictEqual(isNonEmptyArray(undefined), false);
  });

  test('returns false for symbols', () => {
    assert.strictEqual(isNonEmptyArray(Symbol('1')), false);
    assert.strictEqual(isNonEmptyArray(Symbol('[1]')), false);
  });

  test('returns false for booleans', () => {
    assert.strictEqual(isNonEmptyArray(true), false);
    assert.strictEqual(isNonEmptyArray(false), false);
  });
});

describe('isEmptyArray', () => {
  test('returns true for empty arrays', () => {
    assert.strictEqual(isEmptyArray([]), true);
  });

  test('returns false for non-empty arrays', () => {
    assert.strictEqual(isEmptyArray([1, 2, 3]), false);
    assert.strictEqual(isEmptyArray(['a', 'b']), false);

    // The prototype of Array is also an array, but in Node it's considered empty
    // assert.strictEqual(isEmptyArray(Array.prototype), false);
  });

  test('returns false on fake empty arrays', () => {
    assert.strictEqual(isEmptyArray({ __proto__: Array.prototype, length: 0 }), false);
    assert.strictEqual(isEmptyArray(Object.create(Array.prototype)), false);

    const fakeArray = {};
    Object.setPrototypeOf(fakeArray, Array.prototype);
    assert.strictEqual(isNonEmptyArray(fakeArray), false);
  });

  test('returns false for strings', () => {
    assert.strictEqual(isEmptyArray('12n'), false);
    assert.strictEqual(isEmptyArray('[]'), false);
  });

  test('returns false for null', () => {
    assert.strictEqual(isEmptyArray(null), false);
  });

  test('returns false for undefined', () => {
    assert.strictEqual(isEmptyArray(undefined), false);
  });

  test('returns false for symbols', () => {
    assert.strictEqual(isEmptyArray(Symbol('1')), false);
    assert.strictEqual(isEmptyArray(Symbol('[]')), false);
  });

  test('returns false for booleans', () => {
    assert.strictEqual(isEmptyArray(true), false);
    assert.strictEqual(isEmptyArray(false), false);
  });
});

class MagicInspector {
  type() {
    return 'sleight of hand';
  }
}

class MagicRevealer extends MagicInspector {
  spill() {
    throw new Error('A true magician never reveals their secrets');
  }
}

describe('hasType', () => {
  test('returns true if the type property exists', () => {
    assert.strictEqual(hasType({ type: 'car', color: 'red' }), true);
  });

  test('returns true if the type method exists', () => {
    assert.strictEqual(hasType(new MagicInspector()), true);
  });

  test('returns true if the type method is inherited', () => {
    assert.strictEqual(hasType(new MagicRevealer()), true);
  });

  test('returns false if neither the type property, nor the method exists', () => {
    assert.strictEqual(hasType({ color: 'green' }), false);
  });
});

class IdGenerator {
  id() {
    return Math.random() * 42;
  }
}

class MagicIdGenerator extends IdGenerator {
  magic() {
    return '🔮';
  }
}

describe('assertHasId', () => {
  test('returns nothing if the id property is present', () => {
    assert.doesNotThrow(() => assertHasId({ id: 1 }));
    assert.doesNotThrow(() => assertHasId({ id: 42, color: 'red' }));

    const oven = new Oven();
    oven.id = 42;
    assert.doesNotThrow(() => assertHasId(oven));

    // Even when there is no ID set
    assert.doesNotThrow(() => assertHasId({ id: null }));
  });

  test('returns nothing if the id method is present', () => {
    assert.doesNotThrow(() => assertHasId(new IdGenerator()));
  });

  test('returns nothing if the id method is inherited', () => {
    assert.doesNotThrow(() => assertHasId(new MagicIdGenerator()));
  });

  test("throws error if object has no 'id' property or method", () => {
    assert.throws(() => assertHasId({}), Error);
    assert.throws(() => assertHasId({ color: 'green' }), Error);
  });
});

class SimpleData {
  constructor() {
    this.number = '42';
    this.id = 'BC269327FE1D9B95';
  }
}

class StealingData extends SimpleData {}

class MethodData {
  constructor() {
    this.number = '42';
    this._id = 'BC269327FE1D9B95';
  }

  get id() {
    return this._id;
  }
}

describe('hasIdProperty', () => {
  test('returns true if it has the id property', () => {
    assert.strictEqual(hasIdProperty({ id: 'test' }), true);
    assert.strictEqual(hasIdProperty(new SimpleData()), true);
  });

  test('returns false if it does not have the id property', () => {
    assert.strictEqual(hasIdProperty(new MethodData()), false);
    assert.strictEqual(hasIdProperty({ color: 'green' }), false);
  });

  test('returns true if the id property was set in the constructor in the prototype chain', () => {
    assert.strictEqual(hasIdProperty(new StealingData()), true);
  });
});

describe('hasDefinedType', () => {
  test('returns true if the type property is defined and set', () => {
    assert.strictEqual(hasDefinedType({ type: 'car', color: 'green' }), true);
  });

  test('returns true if the type property is defined and set to an empty value', () => {
    assert.strictEqual(hasDefinedType({ type: null, color: 'blue' }), true);
  });

  test('returns false if the type property is defined but not set', () => {
    assert.strictEqual(hasDefinedType({ type: undefined, color: 'red' }), false);
  });

  test('returns false if the type property is missing', () => {
    assert.strictEqual(hasDefinedType({ color: 'white' }), false);
    assert.strictEqual(hasDefinedType(new MagicInspector()), false);
  });
});
