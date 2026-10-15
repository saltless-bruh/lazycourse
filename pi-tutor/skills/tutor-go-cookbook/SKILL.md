---
name: tutor-go-cookbook
description: "Plain-words step → Go idiom, each on a small unrelated example, with the minimum Go version and bridge lines from Python, Rust, TypeScript and Lua. Use when the design recipe reaches Map (step 5), when the learner knows what to do but not how in Go, or when a [workflow] line says Map."
---

# Go cookbook

How to use: find the learner's plain step below, show the idiom on the example here (never on their task), and let them apply it. Below rung 5 never write their line.

## read-args: read the command-line arguments
since: 1.0
`os.Args[0]` is the program, so `os.Args[1:]` is the arguments as strings (use the `flag` package for options).
```go
package main

import (
	"fmt"
	"os"
	"strings"
)

func main() {
	words := os.Args[1:]
	if len(words) == 0 {
		words = []string{"mercury", "venus"}
	}
	fmt.Printf("%d planets: %s\n", len(words), strings.Join(words, ", "))
}
```
Bridge: Python `sys.argv[1:]` · Rust `std::env::args().skip(1)` · TypeScript `process.argv.slice(2)` · Lua `arg[1]`

## parse-number: turn text into a number, handling bad input
since: 1.0
`strconv.Atoi` returns the number and an `error`; check the error before using the number.
```go
package main

import (
	"fmt"
	"strconv"
)

func main() {
	for _, raw := range []string{"21", "oops", "-4"} {
		c, err := strconv.Atoi(raw)
		if err != nil {
			fmt.Printf("%q is not a whole number\n", raw)
			continue
		}
		fmt.Println(c, "C is", float64(c)*9/5+32, "F")
	}
}
```
Bridge: Python `int(s)` with `except ValueError` · Rust `s.parse::<i64>()` returns a `Result` · TypeScript `Number(s)` then `Number.isNaN` · Lua `tonumber(s)` returns `nil`

## loop-index: loop over items with their position
since: 1.0
`for i, x := range slice` gives the index and a copy of the element; use `_` to drop either.
```go
package main

import "fmt"

func main() {
	rivers := []string{"Nile", "Amazon", "Yangtze"}
	for i, river := range rivers {
		fmt.Println(i+1, river)
	}
}
```
Bridge: Python `for i, x in enumerate(xs)` · Rust `for (i, x) in xs.iter().enumerate()` · TypeScript `for (const [i, x] of xs.entries())` · Lua `for i, x in ipairs(xs)`

## lookup-default: look up a key with a fallback value
since: 1.0
A missing key returns the zero value; the "comma ok" form tells you whether the key was really there.
```go
package main

import "fmt"

func main() {
	stock := map[string]int{"apples": 3, "pears": 0}
	for _, fruit := range []string{"apples", "pears", "plums"} {
		n, ok := stock[fruit]
		fmt.Println(fruit, n, "known:", ok)
	}
}
```
Bridge: Python `d.get(k, 0)` · Rust `m.get(k).copied().unwrap_or(0)` · TypeScript `m.get(k) ?? 0` · Lua `t[k] or 0`

## count-items: count how often each item appears
since: 1.0
Because a missing key reads as 0, `counts[x]++` works without checking first.
```go
package main

import "fmt"

func main() {
	colours := []string{"red", "blue", "red", "green", "red", "blue"}
	counts := map[string]int{}
	for _, c := range colours {
		counts[c]++
	}
	fmt.Println(counts)
}
```
Bridge: Python `Counter(xs)` · Rust `*counts.entry(x).or_insert(0) += 1` · TypeScript `m.set(x, (m.get(x) ?? 0) + 1)` · Lua `t[x] = (t[x] or 0) + 1`

## group-by: group items by a key
since: 1.0
`append` to a nil slice works, so `g[k] = append(g[k], x)` creates each group on first use.
```go
package main

import "fmt"

func main() {
	animals := []string{"cat", "cow", "dog", "duck", "crow"}
	byLetter := map[byte][]string{}
	for _, name := range animals {
		byLetter[name[0]] = append(byLetter[name[0]], name)
	}
	fmt.Println(byLetter['c'], byLetter['d'])
}
```
Bridge: Python `d.setdefault(k, []).append(x)` · Rust `m.entry(k).or_default().push(x)` · TypeScript `Map.groupBy(xs, f)` · Lua `t[k] = t[k] or {}; table.insert(t[k], x)`

## sort-by: sort records by a field
since: 1.21
`slices.SortFunc` takes a compare function returning negative, zero or positive; `cmp.Compare` writes it for you.
```go
package main

import (
	"cmp"
	"fmt"
	"slices"
)

type Book struct {
	Title string
	Year  int
}

func main() {
	books := []Book{{"Dune", 1965}, {"Emma", 1815}, {"Ulysses", 1922}}
	slices.SortFunc(books, func(a, b Book) int { return cmp.Compare(a.Year, b.Year) })
	for _, b := range books {
		fmt.Println(b.Year, b.Title)
	}
}
```
Bridge: Python `sorted(xs, key=lambda r: r.year)` · Rust `xs.sort_by_key(|r| r.year)` · TypeScript `xs.toSorted((a, b) => a.year - b.year)` · Lua `table.sort(xs, function(a, b) return a.year < b.year end)`

## filter-map: keep some items and transform them
since: 1.0
Go spells it as a plain loop: test, transform, `append` to a new slice.
```go
package main

import "fmt"

func main() {
	temps := []int{12, 25, 31, 8, 28}
	var warmF []float64
	for _, t := range temps {
		if t > 20 {
			warmF = append(warmF, float64(t)*9/5+32)
		}
	}
	fmt.Println(warmF)
}
```
Bridge: Python `[f(x) for x in xs if p(x)]` · Rust `xs.iter().filter(p).map(f).collect()` · TypeScript `xs.filter(p).map(f)` · Lua a `for` loop with `table.insert`

## record-type: define a small record type with named fields
since: 1.0
A `struct` groups named fields; `%+v` prints them with their names, and `==` compares field by field.
```go
package main

import "fmt"

type Planet struct {
	Name  string
	Moons int
}

func main() {
	earth := Planet{Name: "Earth", Moons: 1}
	fmt.Printf("%+v %v\n", earth, earth == Planet{"Earth", 1})
}
```
Bridge: Python `@dataclass` · Rust `struct` · TypeScript `type T = { … }` · Lua a table `{ name = …, moons = … }`

## maybe-value: represent "maybe there is no value"
since: 1.0
Return the value plus a `bool` (the "comma ok" shape) so the caller must look at both.
```go
package main

import "fmt"

func firstLong(words []string) (string, bool) {
	for _, w := range words {
		if len(w) > 6 {
			return w, true
		}
	}
	return "", false
}

func main() {
	if w, ok := firstLong([]string{"fig", "kiwi"}); ok {
		fmt.Println(w)
	} else {
		fmt.Println("none found")
	}
}
```
Bridge: Python `X | None` · Rust `Option<T>` · TypeScript `T | undefined` · Lua `nil`

## errors: report a failure and handle it
since: 1.13
Return an `error` last; wrap it with `%w` to add context, and `errors.Is` still finds the original.
```go
package main

import (
	"errors"
	"fmt"
)

var ErrNoFunds = errors.New("not enough money")

func withdraw(balance, amount int) (int, error) {
	if amount > balance {
		return 0, fmt.Errorf("take %d from %d: %w", amount, balance, ErrNoFunds)
	}
	return balance - amount, nil
}

func main() {
	if _, err := withdraw(10, 25); err != nil {
		fmt.Println("refused:", err, errors.Is(err, ErrNoFunds))
	}
}
```
Bridge: Python `raise` with `try`/`except` · Rust `Result<T, E>` with `?` · TypeScript `throw new Error(...)` with `try`/`catch` · Lua `error(msg)` with `pcall`

## read-file: read a text file line by line
since: 1.1
`bufio.Scanner` reads one line per `Scan()`; check `scanner.Err()` after the loop.
```go
package main

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
)

func main() {
	path := filepath.Join(os.TempDir(), "poem.txt")
	if err := os.WriteFile(path, []byte("roses are red\nviolets are blue\n"), 0o644); err != nil {
		panic(err)
	}
	f, err := os.Open(path)
	if err != nil {
		panic(err)
	}
	defer f.Close()
	scanner := bufio.NewScanner(f)
	for n := 1; scanner.Scan(); n++ {
		fmt.Println(n, scanner.Text())
	}
	if err := scanner.Err(); err != nil {
		panic(err)
	}
}
```
Bridge: Python `for line in open(p)` · Rust `BufReader::new(File::open(p)?).lines()` · TypeScript `readFileSync(p, "utf8").split("\n")` · Lua `for line in io.lines(p)`

## write-file: write text to a file
since: 1.16
`os.WriteFile` creates or replaces the file with the given permissions in one call.
```go
package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

func main() {
	path := filepath.Join(os.TempDir(), "shopping.txt")
	text := strings.Join([]string{"bread", "milk", "eggs"}, "\n") + "\n"
	if err := os.WriteFile(path, []byte(text), 0o644); err != nil {
		panic(err)
	}
	back, _ := os.ReadFile(path)
	fmt.Print(string(back))
}
```
Bridge: Python `Path(p).write_text(s)` · Rust `std::fs::write(p, s)?` · TypeScript `writeFileSync(p, s)` · Lua `io.open(p, "w"):write(s)`

## format-string: build a string from values
since: 1.0
`fmt.Sprintf` fills verbs left to right: `%s` text, `%d` integer, `%.2f` two decimals, `%v` anything.
```go
package main

import "fmt"

func main() {
	item, price, qty := "tea", 3.5, 4
	line := fmt.Sprintf("%d x %s = %.2f EUR", qty, item, price*float64(qty))
	fmt.Println(line)
}
```
Bridge: Python `f"{name}: {n:.2f}"` · Rust `format!("{name}: {n:.2}")` · TypeScript `` `${name}: ${n.toFixed(2)}` `` · Lua `string.format("%s: %.2f", name, n)`

## split-join: split a string and join parts
since: 1.0
`strings.Split` returns a `[]string`; `strings.Join` glues one back with a separator.
```go
package main

import (
	"fmt"
	"strings"
)

func main() {
	trees := strings.Split("oak,pine,birch", ",")
	fmt.Println(trees, len(trees))
	for i, t := range trees {
		trees[i] = strings.ToUpper(t)
	}
	fmt.Println(strings.Join(trees, " | "))
}
```
Bridge: Python `s.split(",")` and `",".join(xs)` · Rust `s.split(',')` and `xs.join(",")` · TypeScript `s.split(",")` and `xs.join(",")` · Lua `s:gmatch("[^,]+")` and `table.concat(xs, ",")`

## test-function: write a unit test for a function
since: 1.0
Tests go in a `_test.go` file in the same package; each `func TestX(t *testing.T)` reports with `t.Errorf`. Run them with `go test ./...`.
```go
package main

import (
	"strings"
	"testing"
)

func initials(name string) string {
	var b strings.Builder
	for _, part := range strings.Fields(name) {
		b.WriteString(strings.ToUpper(part[:1]))
	}
	return b.String()
}

func TestInitials(t *testing.T) {
	cases := map[string]string{"ada lovelace": "AL", "": ""}
	for in, want := range cases {
		if got := initials(in); got != want {
			t.Errorf("initials(%q) = %q, want %q", in, got, want)
		}
	}
}
```
Bridge: Python `unittest` or `pytest` · Rust `#[test]` in a `mod tests` · TypeScript `test()` from `node:test` · Lua `assert(...)` or busted

## read-trace: read a stack trace (point to `tutor-stack-traces`)
since: -
A Go crash prints `panic:` and the message, then `goroutine 1 [running]:` and the calls, newest first; each call is followed by its `file.go:line`. The first frame in the learner's own code is usually the place to look. For the full walk-through, load `tutor-stack-traces` (section Go).
Bridge: Python the traceback, read bottom-up · Rust panic message plus `RUST_BACKTRACE=1` · TypeScript the stack, read top-down · Lua `stack traceback:`
