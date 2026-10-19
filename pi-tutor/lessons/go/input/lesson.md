---
concept: input
title: "Reading what the user types"
tags: [files-io]
source: gobyexample 28c81a7 examples/line-filters (CC BY 3.0); exercises ours
order: 30.5
---

From *Go by Example: Line Filters*, a program that reads input line by line:

```go
// A _line filter_ is a common type of program that reads
// input on stdin, processes it, and then prints some
// derived result to stdout. `grep` and `sed` are common
// line filters.

// Here's an example line filter in Go that writes a
// capitalized version of all input text. You can use this
// pattern to write your own Go line filters.
package main

import (
	"bufio"
	"fmt"
	"os"
	"strings"
)

func main() {

	// Wrapping the unbuffered `os.Stdin` with a buffered
	// scanner gives us a convenient `Scan` method that
	// advances the scanner to the next token; which is
	// the next line in the default scanner.
	scanner := bufio.NewScanner(os.Stdin)

	for scanner.Scan() {
		// `Text` returns the current token, here the next line,
		// from the input.
		ucl := strings.ToUpper(scanner.Text())

		// Write out the uppercased line.
		fmt.Println(ucl)
	}

	// Check for errors during `Scan`. End of file is
	// expected and not reported by `Scan` as an error.
	if err := scanner.Err(); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}
```

In the exercise the function receives an `io.Reader` instead of using `os.Stdin` directly, so the tests can type for you; in your program you pass `os.Stdin` itself.

Source: [Go by Example by Mark McGranaghan, CC BY 3.0 (licenses/gobyexample/NOTICE), excerpt; changes made.](https://github.com/mmcgrana/gobyexample/tree/28c81a7a0eb874a1c062ae28d19b88effd24620f/examples/line-filters)
