# Instructions

You're working on implementing a health-monitoring system. As part of that, you need to keep track of users' health statistics.

You'll start with some stubbed functions in an `impl` block as well as the following struct definition:

```rust
pub struct User {
    name: String,
    age: u32,
    weight: f32,
}
```

Your goal is to implement the stubbed out methods on the `User` `struct` defined in the `impl` block.

For example, the `new` method should return an instance of the `User` struct with the specified name, age, and weight values.

```rust
let mut bob = User::new(String::from("Bob"), 32, 155.2);
// Returns: a User with name "Bob", age 32, and weight 155.2
```

The `weight` method should return the weight of the `User`.

```rust
bob.weight();
// Returns: 155.2
```

The `set_age` method should set the age of the `User`.

```rust
bob.set_age(33);
// Updates Bob's age to 33; happy birthday Bob!
```

Have fun!

## Hints

## General

## 1. Implement the `new()` method

- The `new()` method receives the arguments we want to instantiate a `User` instance with. It should return an instance of `User` with the specified name, age, and weight.

- See [here](https://doc.rust-lang.org/book/ch05-01-defining-structs.html) for additional examples on defining and instantiating structs.

## 2. Implement the getter methods

- The `name()`, `age()`, and `weight()` methods are getters. In other words, they are responsible for returning the corresponding field from a struct instance.

- Notice that the `name` method returns a `&str` when the `name` field on the `User` struct is a `String`. How can we get `&str` and `String` to play nice with each other?

- There's no need to use a `return` statement in Rust unless you expressly want a function or method to return early. Otherwise, it's more idiomatic to utilize an _implicit_ return by omitting the semicolon for the result we want a function or method to return. It's not _wrong_ to use an explicit return, but it's cleaner to take advantage of implicit returns where possible.

```rust
fn foo() -> i32 {
    1
}
```

- See [here](https://doc.rust-lang.org/book/ch05-03-method-syntax.html) for some more examples of defining methods on structs.

## 3. Implement the setter methods

- The `set_age()` and `set_weight()` methods are setters, responsible for updating the corresponding field on a struct instance with the input argument.

- As the signatures of these methods specify, the setter methods shouldn't return anything.
