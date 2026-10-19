import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  createVisitor,
  gtcVersion,
  revokeTicket,
  simpleTicketStatus,
  ticketStatus,
} from './solution.js';

describe('createVisitor', () => {
  test('correctly assembles the visitor object', () => {
    const expected1 = { name: 'Imran Kudrna', age: 21, ticketId: 'ECMZR67C' };
    const expected2 = { name: 'Nālani Sansone', age: 76, ticketId: 'YX52GB06' };
    const expected3 = { name: 'Bogiła Kalš', age: 55, ticketId: '30Z2OKJP' };

    assert.deepStrictEqual(createVisitor('Imran Kudrna', 21, 'ECMZR67C'), expected1);
    assert.deepStrictEqual(createVisitor('Nālani Sansone', 76, 'YX52GB06'), expected2);
    assert.deepStrictEqual(createVisitor('Bogiła Kalš', 55, '30Z2OKJP'), expected3);
  });
});

describe('revokeTicket', () => {
  test('sets the ticketId to null', () => {
    const visitor = { name: 'María Pilar Neri', age: 16, ticketId: 'MFBSF3S2' };

    const expected = { name: 'María Pilar Neri', age: 16, ticketId: null };
    assert.deepStrictEqual(revokeTicket(visitor), expected);
  });

  test('returns the same object that was passed in', () => {
    const visitor = { name: 'Anatoli Traverse', age: 34, ticketId: 'AA5AA01D' };

    // This checks that the same object that was passed in is returned.
    // https://jestjs.io/docs/expect#tobevalue
    assert.strictEqual(Object.is(revokeTicket(visitor), visitor), true);
  });

  test('does nothing if the ticket was already revoked', () => {
    const visitor = { name: 'Min-Ji Chu', age: 51, ticketId: null };
    const actual = revokeTicket(visitor);

    assert.deepStrictEqual(actual, visitor);
    // This checks that the same object that was passed in is returned.
    assert.strictEqual(Object.is(actual, visitor), true);
  });
});

describe('ticketStatus', () => {
  test('correctly identifies that a ticket is not in the tracking object', () => {
    assert.strictEqual(ticketStatus(testTickets(), 'Y4KXZOYM'), 'unknown ticket id');
    assert.strictEqual(ticketStatus(testTickets(), '8ATQC1ZJ'), 'unknown ticket id');
    assert.strictEqual(ticketStatus(testTickets(), 'G833HR8A'), 'unknown ticket id');
  });

  test('correctly identifies that a ticket is not sold', () => {
    assert.strictEqual(ticketStatus(testTickets(), 'V42NWRMQ'), 'not sold');
    assert.strictEqual(ticketStatus(testTickets(), 'A56MTX8E'), 'not sold');
    assert.strictEqual(ticketStatus(testTickets(), 'YEVHK4MC'), 'not sold');
  });

  test('returns the correct string for a ticket that was sold', () => {
    const actual1 = ticketStatus(testTickets(), 'QINS6S94');
    assert.strictEqual(actual1, 'sold to Hong Hsu');

    const actual2 = ticketStatus(testTickets(), 'H31SAW5Q');
    assert.strictEqual(actual2, 'sold to Lior MacNeil');

    const actual3 = ticketStatus(testTickets(), 'M9ZTXP89');
    assert.strictEqual(actual3, 'sold to Kamani Ybarra');
  });
});

describe('simpleTicketStatus', () => {
  test('identifies ticket that are not in the tracking object as invalid', () => {
    const expected = 'invalid ticket !!!';
    assert.strictEqual(simpleTicketStatus(testTickets(), 'Y4KXZOYM'), expected);
    assert.strictEqual(simpleTicketStatus(testTickets(), '8ATQC1ZJ'), expected);
    assert.strictEqual(simpleTicketStatus(testTickets(), 'G833HR8A'), expected);
  });

  test('identifies tickets that are not sold as invalid', () => {
    const expected = 'invalid ticket !!!';
    assert.strictEqual(simpleTicketStatus(testTickets(), 'V42NWRMQ'), expected);
    assert.strictEqual(simpleTicketStatus(testTickets(), 'A56MTX8E'), expected);
    assert.strictEqual(simpleTicketStatus(testTickets(), 'YEVHK4MC'), expected);
  });

  test('returns the visitor name for tickets that were sold', () => {
    assert.strictEqual(simpleTicketStatus(testTickets(), 'QINS6S94'), 'Hong Hsu');
    assert.strictEqual(simpleTicketStatus(testTickets(), 'H31SAW5Q'), 'Lior MacNeil');
    assert.strictEqual(simpleTicketStatus(testTickets(), 'M9ZTXP89'), 'Kamani Ybarra');
  });

  test('tickets with "strange" name values are valid nevertheless', () => {
    const tickets = {
      B7627X32: '',
      XF1X6S2W: 0,
      KJJIFFO0: false,
    };

    const unexpected = 'invalid ticket !!!';
    assert.notDeepStrictEqual(simpleTicketStatus(tickets, 'B7627X32'), unexpected);
    assert.notDeepStrictEqual(simpleTicketStatus(tickets, 'XF1X6S2W'), unexpected);
    assert.notDeepStrictEqual(simpleTicketStatus(tickets, 'KJJIFFO0'), unexpected);
  });
});

describe('gtcVersion', () => {
  test('determines the GTC version if it is present', () => {
    const visitor1 = {
      name: 'Zohar Pekkanen',
      age: 28,
      ticketId: '8DGM3163',
      gtc: {
        signed: true,
        version: '4.2',
      },
    };

    const visitor2 = {
      name: 'Fen Van der Hout',
      age: 70,
      ticketId: 'BMYPNZGT',
      gtc: {
        signed: true,
        version: '1.6',
      },
    };

    assert.strictEqual(gtcVersion(visitor1), '4.2');
    assert.strictEqual(gtcVersion(visitor2), '1.6');
  });

  test('returns nothing if there is no gtc object', () => {
    const visitor1 = {
      name: 'Xuân Jahoda',
      age: 15,
      ticketId: 'NZGKELXC',
    };

    const visitor2 = {
      name: 'Micha Tót',
      age: 49,
      ticketId: '3BGCW1G9',
    };

    assert.strictEqual(gtcVersion(visitor1), undefined);
    assert.strictEqual(gtcVersion(visitor2), undefined);
  });

  test('returns nothing if there is a gtc object but no gtc version', () => {
    const visitor1 = {
      name: 'Xuân Jahoda',
      age: 15,
      ticketId: 'NZGKELXC',
      gtc: {},
    };

    const visitor2 = {
      name: 'Micha Tót',
      age: 49,
      ticketId: '3BGCW1G9',
      gtc: {
        signed: false,
      },
    };

    assert.strictEqual(gtcVersion(visitor1), undefined);
    assert.strictEqual(gtcVersion(visitor2), undefined);
  });

  test('does not modify the visitor object', () => {
    const visitor = {
      name: 'Zohar Pekkanen',
      age: 28,
      ticketId: '8DGM3163',
    };

    const expected = {
      name: 'Zohar Pekkanen',
      age: 28,
      ticketId: '8DGM3163',
    };

    gtcVersion(visitor);
    assert.deepStrictEqual(visitor, expected);
  });
});

const testTickets = () => {
  return {
    QINS6S94: 'Hong Hsu',
    V42NWRMQ: null,
    A56MTX8E: null,
    H31SAW5Q: 'Lior MacNeil',
    M9ZTXP89: 'Kamani Ybarra',
    YEVHK4MC: null,
  };
};
