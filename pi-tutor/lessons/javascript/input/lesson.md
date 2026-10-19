---
concept: input
title: "Reading what the user types"
tags: [node-apis]
source: nodejs/node bb3f917 doc/api/readline.md (Node.js licence); exercises ours
requires: [functions, strings, while-loops, type-conversion]
order: 40.5
---

From the Node.js documentation, *Readline* (excerpt):

The following simple example illustrates the basic use of the `node:readline`
module.

```js
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const rl = readline.createInterface({ input, output });

const answer = await rl.question('What do you think of Node.js? ');

console.log(`Thank you for your valuable feedback: ${answer}`);

rl.close();
```


`rl.question()` returns a promise of the typed line, so the function that asks is `async`. In the exercise the function receives `ask` (like `rl.question`) instead of making its own interface, so the tests can type for you.

Source: [Node.js docs, readline](https://github.com/nodejs/node/blob/bb3f9176ca9ae9cc304bd460969046340c14d4a0/doc/api/readline.md), Node.js licence (licenses/nodejs-docs/), excerpt.
