# Instructions

A local school near you has a very active students' association.
The students' association is managed by a president and once every 2 years,
elections are run to elect a new president.

In this year's election, it was decided that a new digital system to count the votes was needed.
The school needs your help building this new system.

## 1. Create a vote counter

One of the first things that the new voting system needs is a vote counter.
This counter is a way to keep track of the votes a particular candidate has.

Create a function `NewVoteCounter` that accepts the number of initial votes for a candidate and returns a pointer referring to an `int`, initialized with the given number of initial votes.

```go
var initialVotes int
initialVotes = 2

var counter *int
counter = NewVoteCounter(initialVotes)
*counter == initialVotes // true
```

## 2. Get number of votes from a counter

You now have a way to create new counters! But now you realize the new system will also need a way to get the number of votes from a counter.

Create a function `VoteCount` that will take a counter (`*int`) as an argument and will return the number of votes in the counter.
If the counter is `nil` you should assume the counter has no votes:

```go
var votes int
votes = 3

var voteCounter *int
voteCounter = &votes

VoteCount(voteCounter)
// => 3

var nilVoteCounter *int
VoteCount(nilVoteCounter)
// => 0
```

## 3. Increment the votes of a counter

It's finally the time to count the votes! Now you need a way to increment the votes in a counter.

Create a function `IncrementVoteCount` that will take a counter (`*int`) as an argument and a number of votes, and will increment the counter by that number of votes.
You can assume the pointer passed will never be `nil`.

```go
var votes int
votes = 3

var voteCounter *int
voteCounter = &votes

IncrementVoteCount(voteCounter, 2)

votes == 5          // true
*voteCounter == 5   // true
```

## 4. Create the election results

With all the votes now counted, it's time to prepare the result announcement to the whole school.
For this, you notice that having only counters for the votes is insufficient.
There needs to be a way to associate the number of votes with a particular candidate.

Create a function `NewElectionResult` that receives the name of a candidate and their number of votes and
returns a new election result.

```go
var result *ElectionResult
result = NewElectionResult("Peter", 3)

result.Name == "Peter"  // true
result.Votes == 3       // true
```

The election result struct is already created for you and it's defined as:

```go
type ElectionResult struct {
    // Name of the candidate
    Name    string
    // Votes of votes the candidate had
    Votes   int
}
```

## 5. Announce the results

It's time to announce the new president to the school!
The president will be announced in the little digital message boards that the school has.
The message should show the name of the new president and the votes they had, in the following format: `<candidate_name> (<votes>)`.
This is an example of such message: `"Peter (51)"`.

Create a function `DisplayResult` that will receive an `*ElectionResult` as an argument and will return a string with the message to display.

```go
var result *ElectionResult
result = &ElectionResult{
    Name: "John",
    Votes: 32,
}

DisplayResult(result)
// => John (32)
```

## 6. Vote recounting

To make sure the final results were accurate, the votes were recounted.
In the recount, it was found that the number votes for some of the candidates was off by one.

Create a function `DecrementVotesOfCandidate` that receives the final results and the name of a candidate for which you should decrement its vote count.
The final results are given in the form of a `map[string]int`, where the keys are the names of the candidates and the values are its total votes.

```go
var finalResults = map[string]int{
    "Mary":  10,
    "John":  51,
}

DecrementVotesOfCandidate(finalResults, "Mary")

finalResults["Mary"]
// => 9
```

## Hints

## General

- `*T` can be used to declared variables that are pointers to some type `T`, e.g `var i *int` declares a variable `i` that is a pointer to an `int`
- You can get a pointer for a variable (its memory address) by using the `&` operator, e.g `mypointer := &anIntVariable`.
- You can get the value stored in a pointer by using the `*` operator on a pointer, e.g. `var i int = *aPointerToInt`.
  This is called dereferencing the pointer.
- You check if a pointer is not `nil` before dereferencing it.
  Attempting to dereference a `nil` pointer will give you a runtime error.
- If you are unsure how pointers work, try reading [Tour of Go: Pointers][go-tour-pointers] or [Go by Example: Pointers][go-by-example-pointers]

## 1. Create a vote counter

- You need to create a pointer to an `int`, in other words, a `*int`.
- You can use the `&` operator on a variable to create a pointer to it, e.g `&myInt`
- You can create a pointer to a new variable defined by you or you can use the variable of the function argument

## 2. Get number of votes from a counter

- You can use the `*` operator on a pointer to dereference it and get its value, e.g `*myPointer`
- Dereferencing `nil` pointers will give you a runtime error.
  Always make sure a pointer is not `nil` before dereferencing it.

## 3. Increment the votes of a counter

- If you have a pointer `var myPointer *int`, you can assign to `*myPointer` to change the value pointed by `myPointer`
- To get the current value of the pointer, you need to dereference it using the `*` operator, or call the function you made in the previous task.

## 4. Create the election results

- Create a new `ElectionResult` literal or variable with the fields `Name` and `Votes` filled with the values in the arguments of the function.
- You can create a pointer from a variable or literal by using the `&` operator before the variable name/literal declaration, e.g `&myVariable` or `&ElectionResult{Name: "John", Votes: 1}`

## 5. Announce the results

- Although you are receiving a pointer to an `ElectionResult`, you can access its fields with the dot `.` notation, like if it wasn't a pointer!
- Build the message by accessing the `Name` and `Value` fields on the struct.
- Even though you are accessing fields from a pointer to a struct, you don't need to do any dereferencing.
  Go will automatically dereference the pointer for you, like in this example:

```go
result := &ElectionResult{
    Name: "John",
    Votes: 32
}

result.Name // "John" - Go will automatically dereference the pointer
            //          and access the 'Name' field of the dereferenced struct 
```

## 6. Vote recounting

- You can think of maps as being pointers already.
  This means that changes you make to the map inside the function will be visible outside the function.
- To increment the value of a key in a `var m map[string]int`, you have several options: `m["mykey"] = m["mykey"] + 1`, `m["mykey"] += 1` or `m["mykey"]++`.

[go-tour-pointers]: https://tour.golang.org/moretypes/1
[go-by-example-pointers]: https://gobyexample.com/pointers
