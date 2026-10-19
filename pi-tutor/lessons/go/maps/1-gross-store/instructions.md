# Instructions

A friend of yours has an old wholesale store called **Gross Store**.
The name comes from the quantity of the item that the store sell: it's all in [gross unit][gross-unit].
Your friend asked you to implement a point of sale (POS) system for his store.
**First, you want to build a prototype for it.**
**In your prototype, your system will only record the quantity.**
Your friend gave you a list of measurements to help you:

| Unit               | Score |
| ------------------ | ----- |
| quarter_of_a_dozen | 3     |
| half_of_a_dozen    | 6     |
| dozen              | 12    |
| small_gross        | 120   |
| gross              | 144   |
| great_gross        | 1728  |

## 1. Store the unit of measurement in your program

In order to use the measurement, you need to store the measurement in your program.

```go
units := Units()
fmt.Println(units)
// Output: map[...] with entries like ("dozen": 12)
```

## 2. Create a new customer bill

You need to implement a function that create a new (empty) bill for the customer.

```go
bill := NewBill()
fmt.Println(bill)
// Output: map[]
```

## 3. Add an item to the customer bill

To implement this, you'll need to:

- Return `false` if the given `unit` is not in the `units` map.
- Otherwise add the item to the customer `bill`, indexed by the item name, then return `true`.
- If the item is already present in the bill, increase its quantity by the amount that belongs to the provided `unit`.

```go
bill := NewBill()
units := Units()
ok := AddItem(bill, units, "carrot", "dozen")
fmt.Println(ok)
// Output: true (since dozen is a valid unit)
```

> Note that the returned value is type `bool`.

## 4. Remove an item from the customer bill

To implement this, you'll need to:

- Return `false` if the given item is **not** in the bill
- Return `false` if the given `unit` is not in the `units` map.
- Return `false` if the new quantity would be less than 0.
- If the new quantity is 0, completely remove the item from the `bill` then return `true`.
- Otherwise, reduce the quantity of the item and return `true`.

```go
bill := NewBill()
units := Units()
ok := RemoveItem(bill, units, "carrot", "dozen")
fmt.Println(ok)
// Output: false (because there are no carrots in the bill)
```

> Note that the returned value is type `bool`.

## 5. Return the quantity of a specific item that is in the customer bill

To implement this, you'll need to:

- Return `0` and `false` if the `item` is not in the bill.
- Otherwise, return the quantity of the item in the `bill` and `true`.

```go
bill := map[string]int{"carrot": 12, "grapes": 3}
qty, ok := GetItem(bill, "carrot")
fmt.Println(qty)
// Output: 12
fmt.Println(ok)
// Output: true
```

> Note that the returned value are types `int` and `bool`.

[gross-unit]: https://en.wikipedia.org/wiki/Gross_(unit)

## Hints

## General

- [Go by example map][gobyexample-map]
- [Go maps in action][goblog-map]

## 1. Store the unit of measurement in your program

- To store the measurement in your program, you can use map literal, see [go blog about map][goblog-map]

## 2. Create a new bill

- To create a new bill, all you need to do is reinitialize the customer, see [go blog about map][goblog-map]

## 3. Add item to the customer bill

- To check whether the given unit of measurement is correct, you can test your measurement map for a key without retrieving a value, see [go blog about map][goblog-map]

## 4. Remove item from the customer bill

- To check whether the given item is in customer bill, you can test your measurement map for a key without retrieving a value, see [go blog about map][goblog-map]

- To check whether the given unit of measurement is correct, you can test your measurement map for a key without retrieving a value, see [go blog about map][goblog-map]

## 5. Return the number of specific item that is in the customer bill

- To check whether the given item is in customer bill, you can test your measurement map for a key without retrieving a value, see [go blog about map][goblog-map]

[gobyexample-map]: https://gobyexample.com/maps
[goblog-map]: https://blog.golang.org/maps
