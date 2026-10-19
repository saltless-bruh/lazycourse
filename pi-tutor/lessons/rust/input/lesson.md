---
concept: input
title: "Reading what the user types"
tags: [strings]
source: rust-lang/book 1500248 ch02 (MIT/Apache-2.0); exercises ours
order: 50.5
---

From *The Rust Programming Language*, chapter 2 (excerpt):

If we hadn’t imported the `io` module with `use std::io;` at the beginning of
the program, we could still use the function by writing this function call as
`std::io::stdin`. The `stdin` function returns an instance of
`std::io::Stdin`, which is a type that represents a
handle to the standard input for your terminal.

Next, the line `.read_line(&mut guess)` calls the `read_line` method on the standard input handle to get input from the user.
We’re also passing `&mut guess` as the argument to `read_line` to tell it what
string to store the user input in. The full job of `read_line` is to take
whatever the user types into standard input and append that into a string
(without overwriting its contents), so we therefore pass that string as an
argument. The string argument needs to be mutable so that the method can change
the string’s content.


In the exercise the function reads from any `BufRead` instead of `std::io::stdin()`, so the tests can type for you; in your program you pass `std::io::stdin().lock()`.

Source: [The Rust Book, ch. 2](https://github.com/rust-lang/book/blob/1500248d8f230566e4ec9f27fcbb8fe9e2898ab1/src/ch02-00-guessing-game-tutorial.md), MIT or Apache-2.0 (licenses/rust-book/), excerpt.
