---
name: tutor-rust-cookbook
description: "Plain-words step → Rust idiom, each shown on a small unrelated example, with the minimum Rust version and bridge lines from Python, Go, TypeScript and Lua. Use whenever the learner knows what they want to do but not how to say it in Rust (how do I count words, read a file, sort by a field, handle a bad number…), when the design recipe reaches Map (step 5) or a [workflow] line says Map, even if nobody says 'cookbook'."
---

# Rust cookbook

How to use: find the learner's plain step below and show the idiom on the example here, not on their task. Seeing the construct work somewhere neutral and then applying it to their own code is where the learning happens; writing their line takes that away. The hint ladder still decides how much to give, so until this turn's instruction allows the fix, name the idiom and point at it.

## read-args: read the command-line arguments
since: 1.0
index: `std::env::args().skip(1)`
`std::env::args()` yields the program name first, so `.skip(1)` leaves the arguments as owned `String`s.
```rust
fn main() {
    let mut words: Vec<String> = std::env::args().skip(1).collect();
    if words.is_empty() {
        words = vec!["mercury".to_string(), "venus".to_string()];
    }
    println!("{} planets: {}", words.len(), words.join(", "));
}
```
Bridge: Python `sys.argv[1:]` · Go `os.Args[1:]` · TypeScript `process.argv.slice(2)` · Lua `arg[1]`

## parse-number: turn text into a number, handling bad input
since: 1.0
index: `s.parse::<i64>()` returns a `Result`
`str::parse::<T>()` returns a `Result`; `match` on it so the bad case is handled where it happens.
```rust
fn main() {
    for raw in ["21", "oops", "-4"] {
        match raw.parse::<i64>() {
            Ok(c) => println!("{c} C is {} F", c as f64 * 9.0 / 5.0 + 32.0),
            Err(e) => println!("{raw:?} is not a whole number ({e})"),
        }
    }
}
```
Bridge: Python `int(s)` with `except ValueError` · Go `strconv.Atoi(s)` returns `(n, err)` · TypeScript `Number(s)` then `Number.isNaN` · Lua `tonumber(s)` returns `nil`

## loop-index: loop over items with their position
since: 1.0
index: `for (i, x) in xs.iter().enumerate()`
`.iter().enumerate()` yields `(index, &item)` pairs; indexes start at 0.
```rust
fn main() {
    let rivers = ["Nile", "Amazon", "Yangtze"];
    for (i, river) in rivers.iter().enumerate() {
        println!("{} {river}", i + 1);
    }
}
```
Bridge: Python `for i, x in enumerate(xs)` · Go `for i, x := range xs` · TypeScript `for (const [i, x] of xs.entries())` · Lua `for i, x in ipairs(xs)`

## lookup-default: look up a key with a fallback value
since: 1.35
index: `get(k).copied().unwrap_or(0)`
`HashMap::get` returns `Option<&V>`; `.copied()` turns it into `Option<V>` and `.unwrap_or` supplies the fallback.
```rust
use std::collections::HashMap;

fn main() {
    let stock = HashMap::from([("apples", 3), ("pears", 0)]);
    for fruit in ["apples", "plums"] {
        println!("{fruit} {}", stock.get(fruit).copied().unwrap_or(0));
    }
}
```
Bridge: Python `d.get(k, 0)` · Go `v, ok := m[k]` · TypeScript `m.get(k) ?? 0` · Lua `t[k] or 0`

## count-items: count how often each item appears
since: 1.0
index: `entry(x).or_insert(0)`
`map.entry(key).or_insert(0)` gives a mutable reference to the count, created at 0 the first time.
```rust
use std::collections::BTreeMap;

fn main() {
    let colours = ["red", "blue", "red", "green", "red", "blue"];
    let mut counts: BTreeMap<&str, u32> = BTreeMap::new();
    for c in colours {
        *counts.entry(c).or_insert(0) += 1;
    }
    println!("{counts:?}");
}
```
Bridge: Python `Counter(xs)` · Go `counts[x]++` · TypeScript `m.set(x, (m.get(x) ?? 0) + 1)` · Lua `t[x] = (t[x] or 0) + 1`

## group-by: group items by a key
since: 1.28
index: `m.entry(k).or_default().push(x)`
`entry(key).or_default()` creates an empty `Vec` the first time, then you `push` into it.
```rust
use std::collections::BTreeMap;

fn main() {
    let animals = ["cat", "cow", "dog", "duck", "crow"];
    let mut by_letter: BTreeMap<char, Vec<&str>> = BTreeMap::new();
    for name in animals {
        let first = name.chars().next().unwrap();
        by_letter.entry(first).or_default().push(name);
    }
    println!("{by_letter:?}");
}
```
Bridge: Python `d.setdefault(k, []).append(x)` · Go `g[k] = append(g[k], x)` · TypeScript `Map.groupBy(xs, f)` · Lua `t[k] = t[k] or {}; table.insert(t[k], x)`

## sort-by: sort records by a field
since: 1.7
index: `xs.sort_by_key(|r| r.year)`
`sort_by_key` sorts in place by what the closure returns; use `sort_by` with `cmp` for two fields.
```rust
struct Book { title: &'static str, year: u32 }

fn main() {
    let mut books = vec![
        Book { title: "Dune", year: 1965 },
        Book { title: "Emma", year: 1815 },
        Book { title: "Ulysses", year: 1922 },
    ];
    books.sort_by_key(|b| b.year);
    for b in &books {
        println!("{} {}", b.year, b.title);
    }
}
```
Bridge: Python `sorted(xs, key=lambda r: r.year)` · Go `slices.SortFunc(xs, func(a, b T) int { return cmp.Compare(a.Year, b.Year) })` · TypeScript `xs.toSorted((a, b) => a.year - b.year)` · Lua `table.sort(xs, function(a, b) return a.year < b.year end)`

## filter-map: keep some items and transform them
since: 1.0
index: `iter().filter().map()`
Iterator adapters are lazy: `filter` then `map`, and `collect` builds the result.
```rust
fn main() {
    let temps = [12, 25, 31, 8, 28];
    let warm_f: Vec<f64> = temps
        .iter()
        .filter(|&&t| t > 20)
        .map(|&t| t as f64 * 9.0 / 5.0 + 32.0)
        .collect();
    println!("{warm_f:?}");
}
```
Bridge: Python `[f(x) for x in xs if p(x)]` · Go a `for` loop with `append` · TypeScript `xs.filter(p).map(f)` · Lua a `for` loop with `table.insert`

## record-type: define a small record type with named fields
since: 1.0
index: `struct`
A `struct` names its fields; `#[derive(...)]` adds printing (`Debug`) and comparison (`PartialEq`).
```rust
#[derive(Debug, Clone, PartialEq)]
struct Planet {
    name: String,
    moons: u32,
}

fn main() {
    let earth = Planet { name: "Earth".to_string(), moons: 1 };
    println!("{earth:?} {}", earth == earth.clone());
}
```
Bridge: Python `@dataclass` · Go `type T struct { … }` · TypeScript `type T = { … }` · Lua a table `{ name = …, moons = … }`

## maybe-value: represent "maybe there is no value"
since: 1.0
index: `Option<T>`
`Option<T>` is `Some(value)` or `None`; the compiler makes the caller handle both.
```rust
fn first_long<'a>(words: &[&'a str]) -> Option<&'a str> {
    words.iter().copied().find(|w| w.len() > 6)
}

fn main() {
    match first_long(&["fig", "kiwi"]) {
        Some(w) => println!("{w}"),
        None => println!("none found"),
    }
}
```
Bridge: Python `X | None` · Go `(v, ok)` or a pointer · TypeScript `T | undefined` · Lua `nil`

## errors: report a failure and handle it
since: 1.13
index: `Result<T, E>` with `?`
Return `Result<T, E>`; inside another function that returns `Result`, `?` passes the error up.
```rust
fn withdraw(balance: u32, amount: u32) -> Result<u32, String> {
    if amount > balance {
        return Err(format!("cannot take {amount}, only {balance} left"));
    }
    Ok(balance - amount)
}

fn twice(balance: u32, amount: u32) -> Result<u32, String> {
    let once = withdraw(balance, amount)?;
    withdraw(once, amount)
}

fn main() {
    match twice(10, 6) {
        Ok(left) => println!("left: {left}"),
        Err(e) => println!("refused: {e}"),
    }
}
```
Bridge: Python `raise` with `try`/`except` · Go `return fmt.Errorf("...: %w", err)` · TypeScript `throw new Error(...)` with `try`/`catch` · Lua `error(msg)` with `pcall`

## read-file: read a text file line by line
since: 1.0
index: `BufReader::lines()`
`BufReader::new(file).lines()` yields `io::Result<String>` per line, without the newline.
```rust
use std::fs::{self, File};
use std::io::{self, BufRead, BufReader};

fn main() -> io::Result<()> {
    let path = std::env::temp_dir().join("poem.txt");
    fs::write(&path, "roses are red\nviolets are blue\n")?;
    for (i, line) in BufReader::new(File::open(&path)?).lines().enumerate() {
        println!("{} {}", i + 1, line?);
    }
    Ok(())
}
```
Bridge: Python `for line in open(p)` · Go `bufio.NewScanner(f)` · TypeScript `readFileSync(p, "utf8").split("\n")` · Lua `for line in io.lines(p)`

## write-file: write text to a file
since: 1.26
index: `std::fs::write(p, s)?`
`std::fs::write` creates or replaces the file in one call; use `OpenOptions` with `.append(true)` to add to it.
```rust
use std::fs;

fn main() -> std::io::Result<()> {
    let path = std::env::temp_dir().join("shopping.txt");
    fs::write(&path, ["bread", "milk", "eggs"].join("\n") + "\n")?;
    print!("{}", fs::read_to_string(&path)?);
    Ok(())
}
```
Bridge: Python `Path(p).write_text(s)` · Go `os.WriteFile(p, b, 0o644)` · TypeScript `writeFileSync(p, s)` · Lua `io.open(p, "w"):write(s)`

## format-string: build a string from values
since: 1.58 (names inside `{}`)
index: `format!("{name}: {n:.2}")`
`format!` builds a `String`; `{:.2}` gives two decimals and `{name}` reads a variable in scope.
```rust
fn main() {
    let (item, price, qty) = ("tea", 3.5_f64, 4);
    let line = format!("{qty} x {item} = {:.2} EUR", price * qty as f64);
    println!("{line}");
}
```
Bridge: Python `f"{name}: {n:.2f}"` · Go `fmt.Sprintf("%s: %.2f", name, n)` · TypeScript `` `${name}: ${n.toFixed(2)}` `` · Lua `string.format("%s: %.2f", name, n)`

## split-join: split a string and join parts
since: 1.3
index: `s.split(',')` and `xs.join(",")`
`split` returns an iterator of `&str`; collect it, and `join` glues a slice of strings.
```rust
fn main() {
    let csv_line = "oak,pine,birch";
    let trees: Vec<&str> = csv_line.split(',').collect();
    println!("{trees:?}");
    let upper: Vec<String> = trees.iter().map(|t| t.to_uppercase()).collect();
    println!("{}", upper.join(" | "));
}
```
Bridge: Python `s.split(",")` and `",".join(xs)` · Go `strings.Split(s, ",")` and `strings.Join(xs, ",")` · TypeScript `s.split(",")` and `xs.join(",")` · Lua `s:gmatch("[^,]+")` and `table.concat(xs, ",")`

## test-function: write a unit test for a function
since: 1.0
index: `#[test]` in a `mod tests`
Tests live in a `#[cfg(test)] mod tests` next to the code; each `#[test]` fn uses `assert_eq!(got, expected)`. Run them with `cargo test`.
```rust
fn initials(name: &str) -> String {
    name.split_whitespace()
        .filter_map(|p| p.chars().next())
        .flat_map(|c| c.to_uppercase())
        .collect()
}

fn main() {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn two_words() {
        assert_eq!(initials("ada lovelace"), "AL");
    }

    #[test]
    fn empty() {
        assert_eq!(initials(""), "");
    }
}
```
Bridge: Python `unittest` or `pytest` · Go `func TestX(t *testing.T)` · TypeScript `test()` from `node:test` · Lua `assert(...)` or busted

## read-trace: read a stack trace (point to `tutor-stack-traces`)
since: -
index: `tutor-stack-traces`
A Rust panic prints `thread 'main' panicked at src/file.rs:line:col:` and the message; that location is where it failed. Run with `RUST_BACKTRACE=1` for the call chain, newest call first. Compile errors are different: read them top-down from the error code. For the full walk-through, load `tutor-stack-traces` (section Rust).
Bridge: Python the traceback, read bottom-up · Go `panic:` and the goroutine trace · TypeScript the stack, read top-down · Lua `stack traceback:`
