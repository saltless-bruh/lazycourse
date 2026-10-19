# Instructions

Mecha Munch™, a grocery shopping automation company, has just hired you to work on their ordering app.
Your team is tasked with building an MVP (_[minimum viable product][mvp]_) that manages all the basic shopping cart activities, allowing users to add, remove, and sort their grocery orders.
Thankfully, a different team is handling all the money and check-out functions!

## 1. Add Item(s) to the User's Shopping Cart

The MVP should allow the user to add items to their shopping cart.
This could be a single item or multiple items at once.
Since this is an MVP, item quantity is indicated by _repeats_.
If a user wants to add 2 Oranges, 'Oranges' will appear twice in the input iterable.
If the user already has the item in their cart, the cart quantity should be increased by 1.
If the item is _new_ to the cart, it should be added with a quantity of 1.

Create the function `add_item(<current_cart>, <items_to_add>)` that takes a cart dictionary and any list-like iterable of items to add as arguments.
It should return a new/updated shopping cart dictionary for the user.

```python
>>> add_item({'Banana': 3, 'Apple': 2, 'Orange': 1},
              ('Apple', 'Apple', 'Orange', 'Apple', 'Banana'))
{'Banana': 4, 'Apple': 5, 'Orange': 2}

>>> add_item({'Banana': 3, 'Apple': 2, 'Orange': 1},
              ['Banana', 'Orange', 'Blueberries', 'Banana'])
{'Banana': 5, 'Apple': 2, 'Orange': 2, 'Blueberries': 1}
```

## 2. Read in Items Listed in the User's Notes App

Uh-oh.
Looks like the product team is engaging in [feature creep][feature creep].
They want to add extra functionality to the MVP.
The application now has to create a shopping cart by reading items off a user's notes app.
Convenient for the users, but slightly more work for the team.

Create the function `read_notes(<notes>)` that can take any list-like iterable as an argument.
The function should parse the items and create a user shopping cart/dictionary.
Each item should be added with a quantity of 1.
The new user cart should then be returned.

```python
>>> read_notes(('Banana','Apple', 'Orange'))
{'Banana': 1, 'Apple': 1, 'Orange': 1}

>>> read_notes(['Blueberries', 'Pear', 'Orange', 'Banana', 'Apple'])
{'Blueberries' : 1, 'Pear' : 1, 'Orange' : 1, 'Banana' : 1, 'Apple' : 1}
```

## 3. Update Recipe "Ideas" Section

The app has an "ideas" section that's filled with finished recipes from various cuisines.
The user can select any one of these recipes and have all its ingredients added to their shopping cart automatically.
The project manager has asked you create a way to edit these "ideas" recipes, since the content team keeps changing around ingredients and quantities.

Create the function `update_recipes(<ideas>, <recipe_updates>)` that takes an "ideas" dictionary and an iterable of recipe updates as arguments.
The function should return the new/updated "ideas" dictionary.

```python
>>>update_recipes(
    {'Banana Bread' : {'Banana': 1, 'Apple': 1, 'Walnuts': 1, 'Flour': 1, 'Eggs': 2, 'Butter': 1},
     'Raspberry Pie' : {'Raspberry': 1, 'Orange': 1, 'Pie Crust': 1, 'Cream Custard': 1}},
    (('Banana Bread', {'Banana': 4,  'Walnuts': 2, 'Flour': 1, 'Butter': 1, 'Milk': 2, 'Eggs': 3}),)
    )
...

{'Banana Bread': {'Banana': 4, 'Walnuts': 2, 'Flour': 1, 'Butter': 1, 'Milk': 2, 'Eggs': 3}, 
 'Raspberry Pie': {'Raspberry': 1, 'Orange': 1, 'Pie Crust': 1, 'Cream Custard': 1}}

>>> update_recipes(
    {'Banana Bread' : {'Banana': 1, 'Apple': 1, 'Walnuts': 1, 'Flour': 1, 'Eggs': 2, 'Butter': 1},
    'Raspberry Pie' : {'Raspberry': 1, 'Orange': 1, 'Pie Crust': 1, 'Cream Custard': 1},
    'Pasta Primavera': {'Eggs': 1, 'Carrots': 1, 'Spinach': 2, 'Tomatoes': 3, 'Parmesan': 2, 'Milk': 1, 'Onion': 1}},
    [('Raspberry Pie', {'Raspberry': 3, 'Orange': 1, 'Pie Crust': 1, 'Cream Custard': 1, 'Whipped Cream': 2}),
    ('Pasta Primavera', {'Eggs': 1, 'Mixed Veggies': 2, 'Parmesan': 2, 'Milk': 1, 'Spinach': 1, 'Bread Crumbs': 1}),
    ('Blueberry Crumble', {'Blueberries': 2, 'Whipped Creme': 2, 'Granola Topping': 2, 'Yogurt': 3})]
    )
...

{'Banana Bread': {'Banana': 1, 'Apple': 1, 'Walnuts': 1, 'Flour': 1, 'Eggs': 2, 'Butter': 1}, 
 'Raspberry Pie': {'Raspberry': 3, 'Orange': 1, 'Pie Crust': 1, 'Cream Custard': 1, 'Whipped Cream': 2}, 
 'Pasta Primavera': {'Eggs': 1, 'Mixed Veggies': 2, 'Parmesan': 2, 'Milk': 1, 'Spinach': 1, 'Bread Crumbs': 1},
 'Blueberry Crumble': {'Blueberries': 2, 'Whipped Creme': 2, 'Granola Topping': 2, 'Yogurt': 3}}
```

## 4. Sort the Items in the User Cart

Once a user has started a cart, the app allows them to sort their items alphabetically.
This makes things easier to find, and helps when there are data-entry errors like having 'potatoes' and 'Potato' in the database.

Create the function `sort_entries(<cart>)` that takes a shopping cart/dictionary as an argument and returns a new, alphabetically sorted one.

```python
>>> sort_entries({'Banana': 3, 'Apple': 2, 'Orange': 1})
{'Apple': 2, 'Banana':3, 'Orange': 1}
```

## 5. Send User Shopping Cart to Store for Fulfillment

The app needs to send a given user's cart to the store for fulfillment.
However, the shoppers in the store need to know which store aisle the item can be found in and if the item needs refrigeration.
So (_rather arbitrarily_) the "fulfillment cart" needs to be sorted in reverse alphabetical order with item quantities combined with location and refrigeration information.

Create the function `send_to_store(<cart>, <aisle_mapping>)` that takes a user shopping cart and a dictionary that has store aisle number and a `True`/`False` for refrigeration needed for each item.
The function should `return` a combined "fulfillment cart" that has (quantity, aisle, and refrigeration) for each item the customer is ordering.
Items should appear in _reverse_ alphabetical order.

```python
>>> send_to_store({'Banana': 3, 'Apple': 2, 'Orange': 1, 'Milk': 2},
                  {'Banana': ['Aisle 5', False], 'Apple': ['Aisle 4', False], 'Orange': ['Aisle 4', False], 'Milk': ['Aisle 2', True]})
{'Orange': [1, 'Aisle 4', False], 'Milk': [2, 'Aisle 2', True], 'Banana': [3, 'Aisle 5', False], 'Apple': [2, 'Aisle 4', False]}
```

## 6. Update the Store Inventory to Reflect what a User Has Ordered.

The app can't just place customer orders endlessly.
Eventually, the store is going to run out of various products.
So your app MVP needs to update the store inventory every time a user sends their order to the store.
Otherwise, customers will order products that aren't actually available.

Create the function `update_store_inventory(<fulfillment_cart>, <store_inventory>)` that takes a "fulfillment cart" and a store inventory.
The function should reduce the store inventory amounts by the number "ordered" in the "fulfillment cart" and then return the updated store inventory.
Where a store item count falls to 0, the count should be replaced by the message 'Out of Stock'.

```python
>>> update_store_inventory({'Orange': [1, 'Aisle 4', False], 'Milk': [2, 'Aisle 2', True], 'Banana': [3, 'Aisle 5', False], 'Apple': [2, 'Aisle 4', False]},
{'Banana': [15, 'Aisle 5', False], 'Apple': [12, 'Aisle 4', False], 'Orange': [1, 'Aisle 4', False], 'Milk': [4, 'Aisle 2', True]})

{'Banana': [12, 'Aisle 5', False], 'Apple': [10, 'Aisle 4', False], 'Orange': ['Out of Stock', 'Aisle 4', False], 'Milk': [2, 'Aisle 2', True]}
```

[feature creep]: https://en.wikipedia.org/wiki/Feature_creep
[mvp]: https://en.wikipedia.org/wiki/Minimum_viable_product

## Hints

## General

Remember, this is an [MVP][mvp].
That means you don't need to get too fancy with error handling or different "edge case" scenarios.
It's OK to be simple and direct with the functions you are writing.

The dictionary section of the [official tutorial][dicts-docs] and the mapping type [official library reference][mapping-types-dict] are excellent places to look for more help with all these methods.


## 1. Add Item(s) to the User's Shopping Cart

- You will need to iterate through each item in `items_to_add`.
- You can avoid a `KeyError` when a key is missing by using a `dict` [method][set-default] that takes a _default value_ as one of its arguments.
- It is also possible to accomplish the same thing manually in the `loop` by using some checking and error handling, but the `dict` method is easier.

## 2. Read in Items Listed in the User's Notes App

- Remember, Python's got a method for _everything_. This one is a _classmethod_ that's an easy way to [populate a `dict`][fromkeys] with keys.
- This `dict` method returns a _new dictionary_, populated with default values. If no value is given, the default value will become `None`

## 3. Update Recipe "Ideas" Section

- Don't overthink this one!  This can be solved in **one** `dict` method call.
- The key word here is .... [_update_][update].

## 4. Sort the Items in the User's Cart

- What method would you call to get an [iterable view of items][items] in the dictionary?
- If you had a `list` or a `tuple`, what [`built-in`][builtins] function might you use to sort them?
- The built-in function you want is the one that returns a _copy_, and doesn't mutate the original.

## 5. Send the User's Shopping Cart to the Store for Fulfillment

- Having a fresh, empty dictionary here as the `fulfillment_cart` might be handy for adding in items.
- `Looping` through the members of the cart might be the most direct way of accessing things here.
- What method would you call to get an [iterable view of just the keys][keys] of the dictionary?
- Remember that you can get the `value` of a given key by using `<dict name>[<key_name>]` syntax.
- If you had a `list` or a `tuple`, what [`built-in`][builtins] function might you use to sort them?
- Remember that the `built-in` function can take an optional `reverse=True` argument.

## 6. Update the Store Inventory to Reflect what a User Has Ordered.

- There is a method that will give you an iterable view of (`key`, `value`) pairs from the dictionary.
- You can access an item in a _nested tuple_ using _bracket notation_:  `<tuple>[<nested_tuple>][<index_of_value>]`
- Don't forget to check if an inventory count falls to zero, you'll need to add in the "Out of Stock" message.

[builtins]: https://docs.python.org/3/library/functions.html
[dicts-docs]: https://docs.python.org/3/tutorial/datastructures.html#dictionaries
[fromkeys]: https://docs.python.org/3/library/stdtypes.html#dict.fromkeys
[items]: https://docs.python.org/3/library/stdtypes.html#dict.items
[keys]: https://docs.python.org/3/library/stdtypes.html#dict.keys
[mapping-types-dict]: https://docs.python.org/3/library/stdtypes.html#mapping-types-dict
[mvp]: https://en.wikipedia.org/wiki/Minimum_viable_product
[set-default]: https://docs.python.org/3/library/stdtypes.html#dict.setdefault
[update]: https://docs.python.org/3/library/stdtypes.html#dict.update
