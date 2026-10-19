# Instructions

As a chess enthusiast, you would like to write your own version of the game.
Yes, there may be plenty of implementations of chess available online already, but yours will be unique!

Each square of the chessboard is identified by a letter-number pair:

- The horizontal rows of squares, called ranks, are numbered 1 through 8.
- The vertical columns of squares, called files, are labeled A through H.

```text
   A B C D E F G H
 8 # _ _ _ # _ _ # 8
 7 _ _ _ _ _ _ _ _ 7
 6 _ _ _ _ # _ _ # 6
 5 _ # _ _ _ _ _ # 5
 4 _ _ _ _ _ _ # # 4
 3 # _ # _ _ _ _ # 3
 2 _ _ _ _ _ _ _ # 2
 1 # _ _ _ _ _ _ # 1
   A B C D E F G H
```

## 1. Given a Chessboard and a File, count how many squares are occupied

Implement the `CountInFile(board Chessboard, file string) int` function.
It should count the total number of occupied squares by ranging over a map.
Return an integer.
Return a count of zero (`0`) if the given file cannot be found in the map.

```go
CountInFile(board, "A")
// => 3
```

## 2. Given a Chessboard and a Rank, count how many squares are occupied

Implement the `CountInRank(board Chessboard, rank int) int` function.
It should count the total number of occupied squares by ranging over the given rank.
Return an integer.
Return a count of zero (`0`) if the given rank is not a valid one (not between `1` and `8`, inclusive).

```go
CountInRank(board, 2)
// => 1
```

## 3. Count how many squares are present in the given chessboard

Implement the `CountAll(board Chessboard) int` function.
It should count how many squares are present in the chessboard and returns an integer.
Since you don't need to check the content of the squares, consider using range omitting both `index` and `value`.

```go
CountAll(board)
// => 64
```

## 4. Count how many squares are occupied in the given chessboard

Implement the `CountOccupied(board Chessboard) int` function.
It should count how many squares are occupied in the chessboard.
Return an integer.

```go
CountOccupied(board)
// => 15
```

## Hints

## General

- An [integer value][integers] can be defined as one or more consecutive digits.
- A [map value][maps] stores key-value data

## 1. Given a Chessboard and a File, count how many squares are occupied

- You can iterate a [map][maps]
- Check if the value is true.
  If it is increment.
  This is to count pieces.
- You have to [explicitly return an integer][return] from a function.

## 2. Given a Chessboard and a Rank, count how many squares are occupied

- You'll first need to check the rank is within range.
- Loop over the chessboard.
- Add one if the square is occupied.

## 3. Count how many squares are present in the given chessboard

- There are many ways to solve this.
- This should return how many squares are configured in a chess-board.

## 4. Count how many squares are occupied in the given chessboard

- Get the CountInFile for all files in the chessboard.

[return]: https://golang.org/ref/spec#Return_statements
[integers]: https://golang.org/ref/spec#Integer_literals
[maps]: /tracks/go/concepts/maps
