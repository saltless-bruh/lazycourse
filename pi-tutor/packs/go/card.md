# Go card

- **Format:** `gofmt` (or `goimports`); check with `go vet`.
- **Names:** `MixedCaps`; a Capitalized name is exported from its package; short receiver names; no `Get` prefix on getters.
- **Errors:** return `error` last; `if err != nil { return fmt.Errorf("doing x: %w", err) }`; test with `errors.Is` / `errors.As`; `panic` only for programmer bugs. A crash prints `panic:` then the goroutine trace, newest call first.
- **Layout:** `go.mod`, a root `main.go` or `cmd/<app>/main.go`, `internal/` for private packages, `*_test.go` beside the code.
- **Test:** `go test ./...`.
- **Newer:** per-iteration loop variables and `range` over an int (1.22), range-over-func iterators such as `maps.Keys` (1.23), generic type aliases (1.24).
- **Pitfalls:** writing to a nil map panics; `append` may share the backing array with the old slice; `:=` in an inner scope shadows `err`; an interface holding a nil pointer is not `nil`; unused imports and variables do not compile; a goroutine blocked on a channel nobody reads leaks.

## Concept tags
- `variables`: declarations, `:=` (aliases: shadowing, short-declaration)
- `types`: basic types, conversion (aliases: conversion, type-conversion)
- `slices`: slices, append (aliases: slice, arrays, append)
- `maps`: maps, comma-ok (aliases: map, nil-map)
- `structs`: structs, embedding (aliases: struct, embedding)
- `methods`: methods, receivers (aliases: method, receivers)
- `interfaces`: interfaces (aliases: interface, nil-interface)
- `errors`: error values, wrapping (aliases: error-handling, err, err-handling, wrapping)
- `pointers`: pointers (aliases: pointer, nil-pointer)
- `goroutines`: goroutines, sync (aliases: goroutine, waitgroup, concurrency)
- `channels`: channels, select (aliases: channel, select)
- `generics`: type parameters (aliases: generic, type-parameters)
- `packages`: packages, modules (aliases: modules, imports, go-mod)
- `testing`: tests (aliases: go-test, tests)
- `iterators`: range-over-func (aliases: range-over-func, iter)
- `strings`: strings, runes (aliases: string, runes)
- `defer`: defer, cleanup (aliases: cleanup)
