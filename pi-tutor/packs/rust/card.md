# Rust card

- **Format:** `cargo fmt` (rustfmt); lint with `cargo clippy`.
- **Names:** `snake_case` functions, variables and modules; `UpperCamelCase` types and traits; `SCREAMING_SNAKE_CASE` constants.
- **Errors:** `Result<T, E>` with `?` for failures, `Option<T>` for absence; `panic!` is for bugs, and `unwrap`/`expect` belong in examples and tests. Compiler errors read top-down: the code (`E0502`) and the arrows show which borrow conflicts; `rustc --explain E0502` explains it.
- **Layout:** `Cargo.toml`, `src/main.rs` or `src/lib.rs`, unit tests in `#[cfg(test)] mod tests` beside the code, integration tests in `tests/`.
- **Test:** `cargo test`.
- **Newer:** edition 2024 and async closures (1.85), `if let … && …` let chains in edition 2024 (1.88).
- **Pitfalls:** a shared and a mutable borrow at once; `String` (owned) vs `&str` (borrowed); `.clone()` to silence the borrow checker hides a design question; integer overflow panics in debug builds; a forgotten `mut`; shadowing hides an earlier binding.

## Concept tags
- `ownership`: moves, drop (aliases: move, moves, drop)
- `borrowing`: references, `&mut` (aliases: borrow-checker, references, e0502, e0499)
- `lifetimes`: `'a` annotations (aliases: lifetime)
- `structs`: structs, impl (aliases: struct, methods)
- `enums`: enums, variants (aliases: enum)
- `pattern-matching`: match, if let (aliases: match, if-let)
- `option`: Option, None (aliases: none, optional)
- `error-handling`: Result, `?` (aliases: result, errors, question-mark, unwrap)
- `traits`: traits, impl Trait (aliases: trait, dyn)
- `generics`: type parameters, bounds (aliases: generic)
- `iterators`: iter, map, collect (aliases: iterator, iter)
- `closures`: closures (aliases: closure, fn-mut)
- `collections`: Vec, HashMap (aliases: vec, hashmap, vectors)
- `strings`: String, &str (aliases: string, str)
- `modules`: mod, use, crates (aliases: crates, use)
- `testing`: tests (aliases: cargo-test, tests)
- `smart-pointers`: Box, Rc, RefCell (aliases: box, rc, refcell)
- `concurrency`: threads, Arc, Mutex (aliases: threads, arc, mutex, async)
