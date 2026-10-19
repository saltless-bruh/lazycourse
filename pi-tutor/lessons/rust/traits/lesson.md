---
concept: traits
title: "traits"
tags: [traits]
source: rustlings bc8e511 exercises/15_traits (MIT)
order: 12
---

# Traits

A trait is a collection of methods.

Data types can implement traits. To do so, the methods making up the trait are defined for the data type. For example, the `String` data type implements the `From<&str>` trait. This allows a user to write `String::from("hello")`.

In this way, traits are somewhat similar to Java interfaces and C++ abstract classes.

Some additional common Rust traits include:

- `Clone` (the `clone` method)
- `Display` (which allows formatted display via `{}`)
- `Debug` (which allows formatted display via `{:?}`)

Because traits indicate shared behavior between data types, they are useful when writing generics.

## Further information

- [Traits](https://doc.rust-lang.org/book/ch10-02-traits.html)

Source: [rustlings exercises/15_traits](https://github.com/rust-lang/rustlings/tree/bc8e51115c9304fbd036f5d6fca683e71363468f/exercises/15_traits), MIT licence.
