# Instructions

A new poetry club has opened in town, and you're thinking of attending.
Because there have been incidents in the past, the club has a very specific door policy which you'll need to master, before attempting entry.

There are two doors at the poetry club, a front and a back door, and both are guarded.
To gain entry, you'll need to work out the password of the day.

The password is always based on a poem and can be derived in a two-step process.

1. The guard will recite the poem, one line at a time and you have to respond with an appropriate letter of that line.
2. The guard will now tell you all the letters you responded with at once, and you need to write them down on a piece of paper in a specific format.

The details of the process depend on which door you are trying to enter.

## 1. Get the first letter of a sentence

To determine the letters for the front door password, you need to respond with the first letter of the line of the poem, that the guard recites to you.

To end up with a nice password, the members of the poetry club like to use _acrostic_ poems.
This means that the first letter of each sentence forms a word.
Here is an example by one of their favorite writers Michael Lockwood.

```text
Stands so high
Huge hooves too
Impatiently waits for
Reins and harness
Eager to leave
```

So when the guard recites **Stands so high**, you'll respond **S**, when the guard recites **Huge hooves too**, you'll respond **H**.

Implement the function `frontDoorResponse` that takes a line of the poem as an argument and returns the first letter of that line.

```javascript
frontDoorResponse('Stands so high');
// => "S"
```

## 2. Capitalize a word

Now that you have all the correct letters, all you need to do to get the password for the front door is to correctly capitalize the word.

Implement the function `frontDoorPassword` that accepts a string (the combined letters you found in task 1) and returns it correctly capitalized.

```javascript
frontDoorPassword('SHIRE');
// => "Shire"

frontDoorPassword('shire');
// => "Shire"
```

## 3. Get the last letter of a sentence

To determine letters for the back door password, you need to respond with the last letter of the line of the poem that the guard recites to you.

The members of the poetry club are really clever.
The poem mentioned before is also _telestich_, which means that the last letter of each sentence also forms a word:

```text
Stands so high
Huge hooves too
Impatiently waits for
Reins and harness
Eager to leave
```

When the guard recites **Stands so high**, you'll respond **h**, when the guard recites **Huge hooves too**, you'll respond **o**.

Note that sometimes the guard does stylistic pauses (in the form of whitespace) at the beginning or at the end of a line.
You will need to ignore those pauses to derive the correct letter.

Implement the function `backDoorResponse` that takes a line of the poem as an argument and returns the last letter of that line that is not a whitespace character.

```javascript
backDoorResponse('Stands so high');
// => "h"

backDoorResponse('Stands so high   ');
// => "h"
```

## 4. Be polite

To enter the poetry club via the back door, you need to be extra polite.
So to derive the password, this time you need to correctly capitalize the word and add `', please'` at the end.

Implement the function `backDoorPassword` that accepts a string (the combined letters you found in task 3) and returns the polite version of the capitalized password.

```javascript
backDoorPassword('horse');
// => "Horse, please"
```

## Hints

## 1. Get the first letter of a sentence

- Revisit the introduction to find out how to retrieve a certain letter of a string.
- The indices start counting from 0.

## 2. Capitalize a word

- Capitalization means having a single _uppercase_ character, followed by _lowercase_ characters.
- So first, you need to extract the first letter and convert it [to upper case][mdn-to-upper-case].
- Then you need to determine the rest of the string (everything besides the first character).
  The [slice method][mdn-slice] can help you with that.
- After you applied the conversion [to lower case][mdn-to-lower-case], you can combine the first letter with the rest using the addition operator `+`.

## 3. Get the last letter of a sentence

- Revisit the introduction to find out how to retrieve a certain letter of a string.
- The index of the last letter can be derived from the `.length` property of the string and the fact that the indices start counting at 0.
- Strings come with a [trim][mdn-trim] method that removes leading and trailing whitespace.

## 4. Be polite

- Re-use an existing function to capitalize the word.
- The addition operator `+` can be used to concatenate two strings.

[mdn-to-upper-case]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/toUpperCase
[mdn-to-lower-case]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/toLowerCase
[mdn-slice]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/slice
[mdn-trim]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/Trim
