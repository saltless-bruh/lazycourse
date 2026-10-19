---
concept: increment-decrement
title: "Increment/Decrement"
tags: [increment-decrement, for-loops]
source: exercism-javascript ff04f35 exercises/concept/bird-watcher (MIT)
order: 7
---

# Introduction

The for loop is one of the most commonly used statements to repeatedly execute some logic.
In JavaScript, it consists of the `for` keyword, a _header_ wrapped in round brackets and a code block that contains the _body_ of the loop wrapped in curly brackets.

```javascript
for (initialization; condition; step) {
  // code that is executed repeatedly as long as the condition is true
}
```

The initialization usually sets up a counter variable, the condition checks whether the loop should be continued or stopped and the step increments the counter at the end of each repetition.
The individual parts of the header are separated by semicolons.

```javascript
const list = ['a', 'b', 'c'];
for (let i = 0; i < list.length; i++) {
  // code that should be executed for each item list[i]
}
```

Defining the step is often done using JavaScript's increment or decrement operator as shown in the example above.
These operators modify a variable in place.
`++` adds one to a number, `--` subtracts one from a number.

```javascript
let i = 3;
i++;
// i is now 4

let j = 0;
j--;
// j is now -1
```

TypeScript runs this JavaScript as it is; types are added on top. See the TypeScript Handbook, *The Basics* (https://www.typescriptlang.org/docs/handbook/2/basic-types.html).

Source: [exercism-javascript](https://github.com/exercism/javascript/tree/ff04f35158cdf61eebfdf18a774010495a1fd6d9/exercises/concept/bird-watcher), MIT licence.
