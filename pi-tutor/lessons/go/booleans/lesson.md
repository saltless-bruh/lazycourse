---
concept: booleans
title: "Booleans"
tags: [booleans]
source: exercism-go 74f09b2 exercises/concept/annalyns-infiltration (MIT)
order: 2
---

# Introduction

Booleans in Go are represented by the predeclared boolean type `bool`, which values can be either `true` or `false`.
It's a defined type.

```go
var closed bool    // boolean variable 'closed' implicitly initialized with 'false'
speeding := true   // boolean variable 'speeding' initialized with 'true'
hasError := false  // boolean variable 'hasError' initialized with 'false' 
```

Go supports three logical operators that can evaluate expressions down to Boolean values, returning either `true` or `false`.

| Operator    | What it means                                 |
| ----------- | --------------------------------------------- |
| `&&` (and)  | It is true if both statements are true.       |
| `\|\|` (or) | It is true if at least one statement is true. |
| `!` (not)   | It is true only if the statement is false.    |

Source: [exercism-go](https://github.com/exercism/go/tree/74f09b25dd12c14571cc684a7cb57149634037bd/exercises/concept/annalyns-infiltration), MIT licence.
