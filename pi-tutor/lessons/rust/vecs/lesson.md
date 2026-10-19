---
concept: vecs
title: "vecs"
tags: [collections]
source: rustlings bc8e511 exercises/05_vecs (MIT)
order: 3
---

# Vectors

Vectors are one of the most-used Rust data structures. In other programming
languages, they'd simply be called Arrays, but since Rust operates on a
bit of a lower level, an array in Rust is stored on the stack (meaning it
can't grow or shrink, and the size needs to be known at compile time),
and a Vector is stored in the heap (where these restrictions do not apply).

Vectors are a bit of a later chapter in the book, but we think that they're
useful enough to talk about them a bit earlier. We shall be talking about
the other useful data structure, hash maps, later.

## Further information

- [Storing Lists of Values with Vectors](https://doc.rust-lang.org/book/ch08-01-vectors.html)
- [`iter_mut`](https://doc.rust-lang.org/std/primitive.slice.html#method.iter_mut)
- [`map`](https://doc.rust-lang.org/std/iter/trait.Iterator.html#method.map)

Source: [rustlings exercises/05_vecs](https://github.com/rust-lang/rustlings/tree/bc8e51115c9304fbd036f5d6fca683e71363468f/exercises/05_vecs), MIT licence.
