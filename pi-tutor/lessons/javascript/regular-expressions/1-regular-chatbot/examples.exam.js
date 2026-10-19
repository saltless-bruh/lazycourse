import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  checkPhoneNumber,
  getURL,
  isValidCommand,
  niceToMeetYou,
  removeEmoji,
} from './solution.js';

describe('isValidCommand', () => {
  test('recognizes wheter the command is at the first position', () => {
    assert.strictEqual(isValidCommand('Chatbot, Do you understand this command?'), true);
    assert.strictEqual(isValidCommand(
        'Hey Chatbot, please tell me what is the weather for tomorrow.',
      ), false);
  });

  test('does not care about UPPERCASE or lowercase', () => {
    assert.strictEqual(isValidCommand('CHATBOT, Is it okey if I shout at you?'), true);
    assert.strictEqual(isValidCommand('chatbot, please tell me what is happening here.'), true);
  });
});

describe('removeEmoji', () => {
  test('removes properly one single emoji encryption', () => {
    const expected = 'What was your name?  Sorry I forgot about it.';
    assert.strictEqual(removeEmoji('What was your name? emoji2134 Sorry I forgot about it.'), expected);
  });

  test('removes all the emoji encryption', () => {
    const expected = ' How about ordering  ?';
    assert.strictEqual(removeEmoji('emoji5321 How about ordering emoji8921 ?'), expected);
  });
});

describe('checkPhoneNumber', () => {
  test('recognizes a phone number with the correct format', () => {
    const expected = 'Thanks! You can now download me to your phone.';
    assert.strictEqual(checkPhoneNumber('(+34) 643-876-459'), expected);
    assert.strictEqual(checkPhoneNumber('(+49) 543-928-190'), expected);
  });

  test('informs the user that it is a wrong phone number format', () => {
    assert.strictEqual(checkPhoneNumber('322-787-654'), "Oops, it seems like I can't reach out to 322-787-654");
    assert.strictEqual(checkPhoneNumber('4355-67-274'), "Oops, it seems like I can't reach out to 4355-67-274");
  });
});

describe('getURL', () => {
  test('returns only the link of the website', () => {
    assert.deepStrictEqual(getURL('You can check more info on youtube.com'), [
      'youtube.com',
    ]);
    assert.deepStrictEqual(getURL('There is a cool website called theodinproject.com to learn from'), ['theodinproject.com']);
  });

  test('returns an array with the multiple websites links', () => {
    assert.deepStrictEqual(getURL('That was from reddit.com and notion.so'), [
      'reddit.com',
      'notion.so',
    ]);
  });
});

describe('niceToMeetYou', () => {
  test('greets the user by its proper name', () => {
    assert.strictEqual(niceToMeetYou('Sanz, Pablo'), 'Nice to meet you, Pablo Sanz');
    assert.strictEqual(niceToMeetYou('Stephan, Sandro'), 'Nice to meet you, Sandro Stephan');
  });
});
