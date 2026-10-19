---
concept: lifetimes
title: "lifetimes"
tags: [lifetimes]
source: rustlings bc8e511 exercises/16_lifetimes (MIT)
order: 13
---

# Lifetimes

Lifetimes tell the compiler how to check whether references live long
enough to be valid in any given situation. For example lifetimes say
"make sure parameter 'a' lives as long as parameter 'b' so that the return
value is valid".

They are only necessary on borrows, i.e. references,
since copied parameters or moves are owned in their scope and cannot
be referenced outside. Lifetimes mean that calling code of e.g. functions
can be checked to make sure their arguments are valid. Lifetimes are
restrictive of their callers.

If you'd like to learn more about lifetime annotations, the
[lifetimekata](https://tfpk.github.io/lifetimekata/) project
has a similar style of exercises to Rustlings, but is all about
learning to write lifetime annotations.

## Further information

- [Lifetimes (in Rust By Example)](https://doc.rust-lang.org/stable/rust-by-example/scope/lifetime.html)
- [Validating References with Lifetimes](https://doc.rust-lang.org/book/ch10-03-lifetime-syntax.html)

Source: [rustlings exercises/16_lifetimes](https://github.com/rust-lang/rustlings/tree/bc8e51115c9304fbd036f5d6fca683e71363468f/exercises/16_lifetimes), MIT licence.
