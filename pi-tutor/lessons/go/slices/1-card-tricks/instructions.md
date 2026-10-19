# Instructions

As a magician-to-be, Elyse needs to practice some basics.
She has a stack of cards that she wants to manipulate.

To make things a bit easier she only uses the cards 1 to 10.

## 1. Create a slice with certain cards

When practicing with her cards, Elyse likes to start with her favorite three cards of the deck: 2, 6 and 9.
Write a function `FavoriteCards` that returns a slice with those cards in that order.

```go
cards := FavoriteCards()
fmt.Println(cards)
// Output: [2 6 9]
```

## 2. Retrieve a card from a stack

Return the card at position `index` from the given stack.

```go
card := GetItem([]int{1, 2, 4, 1}, 2) // card == 4
```

If the index is out of bounds (ie. if it is negative or after the end of the stack), we want to return `-1`:

```go
card := GetItem([]int{1, 2, 4, 1}, 10) // card == -1
```

~~~~exercism/note
By convention in Go, an error is returned instead of returning an "out-of-bounds" value.
Here the "out-of-bounds" value is `-1` when a positive integer is expected.
When returning an error, it's considered idiomatic to return the [`zero value`](https://www.geeksforgeeks.org/zero-value-in-golang/) with the error.
Returning an error with the proper return value will be covered in a future exercise.
~~~~

## 3. Exchange a card in the stack

Exchange the card at position `index` with the new card provided and return the adjusted stack.
Note that this will modify the input slice which is the expected behavior.

```go
index := 2
newCard := 6
cards := SetItem([]int{1, 2, 4, 1}, index, newCard)
fmt.Println(cards)
// Output: [1 2 6 1]
```

If the index is out of bounds (ie. if it is negative or after the end of the stack), we want to append the new card to the end of the stack:

```go
index := -1
newCard := 6
cards := SetItem([]int{1, 2, 4, 1}, index, newCard)
fmt.Println(cards)
// Output: [1 2 4 1 6]
```

## 4. Add cards to the top of the stack

Add the card(s) specified in the `value` parameter at the top of the stack.

```go
slice := []int{3, 2, 6, 4, 8}
cards := PrependItems(slice, 5, 1)
fmt.Println(cards)
// Output: [5 1 3 2 6 4 8]
```

If no argument is given for the `value` parameter, then the result equals the original slice.

```go
slice := []int{3, 2, 6, 4, 8}
cards := PrependItems(slice)
fmt.Println(cards)
// Output: [3 2 6 4 8]
```

## 5. Remove a card from the stack

Remove the card at position `index` from the stack and return the stack.
Note that this may modify the input slice which is ok.

```go
cards := RemoveItem([]int{3, 2, 6, 4, 8}, 2)
fmt.Println(cards)
// Output: [3 2 4 8]
```

If the index is out of bounds (ie. if it is negative or after the end of the stack), we want to leave the stack unchanged:

```go
cards := RemoveItem([]int{3, 2, 6, 4, 8}, 11)
fmt.Println(cards)
// Output: [3 2 6 4 8]
```

## Hints

## General

- Slices in Go are zero-based.
  The first index in a slice is `0`.
- The builtin [`append`][append-builtin] function is [`variadic`][variadic-gobyexample]
- You can append the elements of one slice to another slice by using the three dots notation:

```go
a := []int{1, 3}
b := []int{4, 2, 6}
c := append(a, b...)
fmt.Println(c)
// Output: [1 3 4 2 6]
```

## 1. Create a slice with certain cards

- To create a slice pre-filled with some data, use the slice literal notation: `s := []T{x1, x2, ..., xn}`.

## 2. Retrieve a card from a stack

- To get the `n`th item of a slice [use an index][go-slices].
- To check if an item exists in a slice use a conditional and compare the index with the [length of the slice][len-builtin].

## 3. Exchange a card in the stack

- To set the `n`th item in a slice [use an index][go-slices] and assign a new value to it.
- To add a new item to then end of a slice use the `append` function.

## 4. Add cards to the top of the stack

- Adding items to the front of a slice can be done by appending the elements of the original slice to the `value` argument slice.

## 5. Remove a card from the stack

- Removing an item from a slice can be done by appending the part after `index` to the part before index.

[go-slices]: https://blog.golang.org/go-slices-usage-and-internals
[len-builtin]: https://golang.org/pkg/builtin/#len
[append-builtin]: https://golang.org/pkg/builtin/#append
[variadic-gobyexample]: https://gobyexample.com/variadic-functions
